import {
  Invitation,
  INVITATION_BATCH_NUMBER_UNIQUE,
  INVITATION_BATCH_ONE_OPEN_UNIQUE,
  InvitationBatch,
  isUniqueViolation,
  LockMode,
  MentorProfile,
  Slot,
  User,
  type StackTag,
} from '@devmentor/db';
import type { SessionUser } from '../../auth/session-user';
import type { Cradle } from '../../container/cradle';
import { ConflictError, ForbiddenError } from '../../http/errors';
import { mentorNameForOperator } from '../mentors/mentor-name';
import {
  BATCH_ALREADY_OPEN_MESSAGE,
  BATCH_FULL_MESSAGE,
  batchCounts,
  batchState,
  INVITATION_BATCH_SIZE,
  invitationStatus,
  INVITATIONS_STOPPED_MESSAGE,
  NO_OPEN_BATCH_MESSAGE,
  stopState,
  type BatchCounts,
  type BatchStateLabel,
  type InvitationRowStatus,
} from './invitation-batch.rules';

/** Who acts: a signed-in operator (page, API) or the owner-run `invite` CLI with its `--operator` name. */
export type InvitationActor = { kind: 'session'; user: Pick<SessionUser, 'id' | 'roles'> } | { kind: 'cli'; operator: string };

/** How an operator appears in an 'Operator action' log line (T-14): an id, or the CLI's name. Never an email. */
export type OperatorRef = { id: string } | { cli: string };

export function operatorRef(actor: InvitationActor): OperatorRef {
  return actor.kind === 'session' ? { id: actor.user.id } : { cli: actor.operator };
}

/** A session actor must hold `operator` (403); the CLI is trusted like before (it needs `DATABASE_URL`). */
export function assertOperator(actor: InvitationActor): void {
  if (actor.kind === 'session' && !actor.user.roles.includes('operator')) {
    throw new ForbiddenError();
  }
}

export interface InvitationRowView {
  id: string;
  email: string;
  /** Null before acceptance; after it the display name, or the accepting user's email when the name is blank. */
  mentorName: string | null;
  stackTags: StackTag[];
  status: InvitationRowStatus;
  /** ISO instant, accepted invitations only (may be null for ones accepted before the column existed). */
  publishDueAt: string | null;
}

export interface BatchView {
  number: number;
  state: BatchStateLabel;
  openedAt: string;
  closedAt: string | null;
  counts: BatchCounts;
  /** Oldest first. */
  invitations: InvitationRowView[];
}

export interface InvitationOverview {
  stopped: boolean;
  /** No open batch and not stopped. */
  canOpen: boolean;
  /** 1 when no batch exists. */
  nextBatchNumber: number;
  /** Newest first. */
  batches: BatchView[];
  /** Invitations with no batch (created before batches), oldest first. */
  beforeBatches: InvitationRowView[];
}

export interface OpenedBatch {
  number: number;
  openedAt: string;
}

export interface InvitableBatch {
  batch: InvitationBatch;
  /** Invitations already in the batch, before the one being created. */
  sent: number;
}

interface Evaluated {
  row: Invitation;
  status: InvitationRowStatus;
  mentorName: string | null;
}

/** `SELECT … FOR UPDATE` that re-reads the row (lesson 2026-10-26); built at call time. */
function lockForUpdate() {
  return { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as const;
}

function toRowView({ row, status, mentorName }: Evaluated): InvitationRowView {
  return {
    id: row.id,
    email: row.email,
    mentorName,
    stackTags: [...row.stackTags],
    status,
    publishDueAt: row.publishDueAt?.toISOString() ?? null,
  };
}

type InvitationBatchServiceDeps = Pick<Cradle, 'em' | 'clock' | 'logger'>;

/**
 * Invitation batches (spec 2026-11-24-invitation-batches, R13/D13): opens numbered batches, builds the
 * operator overview, and holds the batch and stop rules `InvitationService.create` applies under the
 * open batch's row lock. The D13 stop is computed per request from batch 1, never stored.
 */
export class InvitationBatchService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly logger: Cradle['logger'];

  constructor({ em, clock, logger }: InvitationBatchServiceDeps) {
    this.em = em;
    this.clock = clock;
    this.logger = logger;
  }

  /**
   * Opens the next batch. Refused while invitations are stopped (checked first) or while a batch is
   * open; two concurrent opens collide on the unique indexes and the loser gets the same 409.
   */
  async open(user: Pick<SessionUser, 'id' | 'roles'>): Promise<OpenedBatch> {
    const actor: InvitationActor = { kind: 'session', user };
    assertOperator(actor);
    const operator = operatorRef(actor);
    let opened: InvitationBatch;

    try {
      opened = await this.em.transactional(async (em) => {
        const now = this.clock.now();
        await this.assertNotStopped(em, now, operator, 'invitation-batch.open');

        if ((await em.count(InvitationBatch, { closedAt: null })) > 0) {
          throw alreadyOpen();
        }

        // `find` + `limit`: MikroORM 7 refuses `findOne` with an empty `where`.
        const [latest] = await em.find(InvitationBatch, {}, { orderBy: { number: 'desc' }, limit: 1 });
        const batch = em.create(InvitationBatch, {
          number: (latest?.number ?? 0) + 1,
          openedBy: user.id,
          openedAt: now,
        });
        await em.flush();

        return batch;
      });
    } catch (error) {
      if (isUniqueViolation(error, INVITATION_BATCH_NUMBER_UNIQUE) || isUniqueViolation(error, INVITATION_BATCH_ONE_OPEN_UNIQUE)) {
        throw alreadyOpen();
      }

      throw error;
    }

    this.logger.info({ operator, action: 'invitation-batch.open', target: { batch: { number: opened.number } } }, 'Operator action');

    return { number: opened.number, openedAt: opened.openedAt.toISOString() };
  }

  /** Every batch (newest first) with counts and rows in words, plus invitations created before batches. */
  async overview(user: Pick<SessionUser, 'id' | 'roles'>): Promise<InvitationOverview> {
    assertOperator({ kind: 'session', user });
    const now = this.clock.now();
    const batches = await this.em.find(InvitationBatch, {}, { orderBy: { number: 'desc' } });
    const rows = await this.evaluate(this.em, await this.em.find(Invitation, {}, { orderBy: { createdAt: 'asc' } }), now);
    const rowsOf = (batchId: string | null) => rows.filter(({ row }) => (row.invitationBatch?.id ?? null) === batchId);
    const batch1 = batches.find((batch) => batch.number === 1) ?? null;
    const { stopped } = stopState(batch1, batch1 === null ? [] : rowsOf(batch1.id).map(({ status }) => status));
    const anyOpen = batches.some((batch) => batch.closedAt == null);

    return {
      stopped,
      canOpen: !stopped && !anyOpen,
      nextBatchNumber: (batches[0]?.number ?? 0) + 1,
      batches: batches.map((batch) => {
        const own = rowsOf(batch.id);

        return {
          number: batch.number,
          state: batchState({ number: batch.number, closedAt: batch.closedAt ?? null }, stopped),
          openedAt: batch.openedAt.toISOString(),
          closedAt: batch.closedAt?.toISOString() ?? null,
          counts: batchCounts(own.map(({ row, status }) => ({ acceptedAt: row.acceptedAt ?? null, status }))),
          invitations: own.map(toRowView),
        };
      }),
      beforeBatches: rowsOf(null).map(toRowView),
    };
  }

  /**
   * Refuses with 409 `INVITATIONS_STOPPED` (and one 'Operator action refused' line) while D13 stops
   * invitations. Runs inside the caller's transaction.
   */
  async assertNotStopped(em: Cradle['em'], now: Date, operator: OperatorRef, action: string): Promise<void> {
    if (await this.isStopped(em, now)) {
      this.logger.info({ operator, action, refused: 'INVITATIONS_STOPPED' }, 'Operator action refused');
      throw new ConflictError(INVITATIONS_STOPPED_MESSAGE, { code: 'INVITATIONS_STOPPED' });
    }
  }

  /**
   * The batch a new invitation goes into, locked `FOR UPDATE` until the caller commits: stop check →
   * lock the open batch → stop check again (a revoke or slot committed while we waited may have
   * decided batch 1) → its current count. No open batch after the lock: `BATCH_FULL` when any batch
   * exists (the latest closed, also for the loser of the 20th-invitation race), `NO_OPEN_BATCH` only
   * when none was ever opened.
   */
  async assertCanInvite(em: Cradle['em'], now: Date, operator: OperatorRef, action: string): Promise<InvitableBatch> {
    await this.assertNotStopped(em, now, operator, action);
    const batch = await em.findOne(InvitationBatch, { closedAt: null }, lockForUpdate());

    if (batch === null) {
      if ((await em.count(InvitationBatch, {})) > 0) {
        throw batchFull();
      }

      throw new ConflictError(NO_OPEN_BATCH_MESSAGE, { code: 'NO_OPEN_BATCH' });
    }

    await this.assertNotStopped(em, now, operator, action);
    const sent = await em.count(Invitation, { invitationBatch: batch.id });

    // Never reached while every writer closes the batch with its 20th invitation; kept as the guard.
    if (sent >= INVITATION_BATCH_SIZE) {
      throw batchFull();
    }

    return { batch, sent };
  }

  private async isStopped(em: Cradle['em'], now: Date): Promise<boolean> {
    const batch1 = await em.findOne(InvitationBatch, { number: 1 });

    if (batch1 === null) {
      return false;
    }

    const rows = await this.evaluate(em, await em.find(Invitation, { invitationBatch: batch1.id }), now);

    return stopState(batch1, rows.map(({ status }) => status)).stopped;
  }

  /**
   * Rule 3 for each row. One query at a time (one EntityManager); the rows are few (20 a batch).
   * Removed slots count, so slots are read without the `removedAt` filter.
   */
  private async evaluate(em: Cradle['em'], rows: readonly Invitation[], now: Date): Promise<Evaluated[]> {
    const evaluated: Evaluated[] = [];

    for (const row of rows) {
      const input = {
        revokedAt: row.revokedAt ?? null,
        acceptedAt: row.acceptedAt ?? null,
        expiresAt: row.expiresAt,
        publishDueAt: row.publishDueAt ?? null,
      };

      // `accepted_at` and `accepted_by_id` are set together (CHECK), so no accepting user = not accepted.
      if (row.acceptedBy == null) {
        evaluated.push({ row, status: invitationStatus(input, [], now), mentorName: null });
        continue;
      }

      const user = await em.findOneOrFail(User, { id: row.acceptedBy.id });
      const profile = await em.findOne(MentorProfile, { user: user.id });
      let slotCreatedAt: Date[] = [];

      if (profile !== null) {
        const slots = await em.find(Slot, { mentorProfile: profile.id, createdAt: { $gte: row.acceptedAt as Date } });
        slotCreatedAt = slots.map((slot) => slot.createdAt);
      }

      evaluated.push({
        row,
        status: invitationStatus(input, slotCreatedAt, now),
        mentorName: mentorNameForOperator(profile?.displayName, user.email),
      });
    }

    return evaluated;
  }
}

function alreadyOpen(): ConflictError {
  return new ConflictError(BATCH_ALREADY_OPEN_MESSAGE, { code: 'BATCH_ALREADY_OPEN' });
}

function batchFull(): ConflictError {
  return new ConflictError(BATCH_FULL_MESSAGE, { code: 'BATCH_FULL' });
}
