import { randomUUID } from 'node:crypto';
import {
  Invitation,
  INVITATION_BATCH_NUMBER_UNIQUE,
  INVITATION_BATCH_ONE_OPEN_UNIQUE,
  InvitationBatch,
  MentorProfile,
  Slot,
  UniqueConstraintViolationException,
  User,
} from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import {
  BATCH_ALREADY_OPEN_MESSAGE,
  BATCH_FULL_MESSAGE,
  INVITATIONS_STOPPED_MESSAGE,
  NO_OPEN_BATCH_MESSAGE,
} from './invitation-batch.rules';
import { assertOperator, InvitationBatchService, operatorRef } from './invitation-batch.service';

// In-memory stand-in for the scoped `EntityManager` over the tables invitation batches read.

type Row = Record<string, unknown>;

interface BatchTables {
  users: User[];
  batches: InvitationBatch[];
  invitations: Invitation[];
  profiles: MentorProfile[];
  slots: Slot[];
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) {
    return actual === null || actual === undefined;
  }

  if (typeof expected === 'object' && expected !== null && '$gte' in expected) {
    return actual instanceof Date && actual >= (expected as { $gte: Date }).$gte;
  }

  // A string compared with a reference's `id` (`{ user: userId }`).
  if (typeof expected === 'string' && actual !== null && typeof actual === 'object' && 'id' in actual) {
    return actual.id === expected;
  }

  return actual === expected;
}

function matches(row: object, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => matchesValue((row as Row)[key], expected));
}

function sortBy<T extends object>(rows: T[], orderBy: Record<string, 'asc' | 'desc'> | undefined): T[] {
  if (orderBy === undefined) {
    return rows;
  }

  const [[key, direction]] = Object.entries(orderBy);
  const sign = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => ((a as Row)[key] as number) > ((b as Row)[key] as number) ? sign : -sign);
}

/**
 * `transactional` runs the callback on the same fake and then flushes (a throw skips the flush, like
 * a rollback); `log` records the order of calls; `failFlush` makes the next flush throw.
 */
function fakeBatchEm(tables: BatchTables) {
  const table = (entity: unknown): object[] => {
    if (entity === InvitationBatch) return tables.batches;
    if (entity === Invitation) return tables.invitations;
    if (entity === MentorProfile) return tables.profiles;
    if (entity === Slot) return tables.slots;
    return tables.users;
  };
  const nameOf = (entity: unknown) => (entity as { name: string }).name;
  const state: { failFlush: unknown; onLock?: () => void } = { failFlush: null };
  const log: string[] = [];
  const em = {
    log,
    state,
    find: vi.fn(async (entity: unknown, where: Row, options?: { orderBy?: Record<string, 'asc' | 'desc'>; limit?: number }) => {
      log.push(`find:${nameOf(entity)}`);
      return sortBy(table(entity).filter((row) => matches(row, where)), options?.orderBy).slice(0, options?.limit);
    }),
    findOne: vi.fn(async (entity: unknown, where: Row, options?: { orderBy?: Record<string, 'asc' | 'desc'>; lockMode?: unknown }) => {
      // MikroORM 7 refuses this (`validateEmptyWhere`); the first integration run hit it in `open` (500).
      if (Object.keys(where).length === 0) {
        throw new Error("You cannot call 'EntityManager.findOne()' with empty 'where' parameter");
      }

      if (options?.lockMode !== undefined) {
        log.push(`lock:${nameOf(entity)}`);
        state.onLock?.();
      }

      return sortBy(table(entity).filter((row) => matches(row, where)), options?.orderBy)[0] ?? null;
    }),
    findOneOrFail: vi.fn(async (entity: unknown, where: Row) => table(entity).find((row) => matches(row, where)) as object),
    count: vi.fn(async (entity: unknown, where: Row) => table(entity).filter((row) => matches(row, where)).length),
    create: vi.fn((entity: unknown, data: Row) => {
      const row = Object.assign(new (entity as new () => object)(), { id: randomUUID(), closedAt: null, resumedAt: null, ...data });
      table(entity).push(row);
      log.push(`create:${nameOf(entity)}`);
      return row;
    }),
    flush: vi.fn(async () => {
      if (state.failFlush !== null) {
        const error = state.failFlush;
        state.failFlush = null;
        throw error;
      }

      log.push('flush');
    }),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      log.push('begin');
      const result = await callback(em);
      await em.flush();
      log.push('commit');
      return result;
    }),
  };

  return em;
}

const DAY_MS = 86_400_000;

function makeBatch(number: number, overrides: Partial<InvitationBatch> = {}): InvitationBatch {
  return Object.assign(new InvitationBatch(), {
    id: randomUUID(),
    number,
    openedAt: new Date(`2026-10-0${Math.min(number, 9)}T09:00:00.000Z`),
    closedAt: null,
    resumedAt: null,
    ...overrides,
  });
}

function makeBatchInvitation(batch: InvitationBatch | null, overrides: Partial<Invitation> = {}): Invitation {
  return Object.assign(new Invitation(), {
    id: randomUUID(),
    email: `${randomUUID().slice(0, 8)}@devmentor.test`,
    tokenHash: randomUUID(),
    stackTags: ['typescript'],
    batch: null,
    invitationBatch: batch === null ? null : { id: batch.id },
    expiresAt: new Date('2026-10-15T00:00:00.000Z'),
    acceptedAt: null,
    acceptedBy: null,
    publishDueAt: null,
    revokedAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  });
}

/**
 * Batch 1 with 20 invitations, decided at `now`: `published` accepted mentors with a slot in their
 * window, the rest expired without acceptance.
 */
function decidedBatch1(tables: BatchTables, published: number): InvitationBatch {
  const batch = makeBatch(1, { closedAt: new Date('2026-10-02T00:00:00.000Z') });
  const acceptedAt = new Date('2026-10-03T00:00:00.000Z');
  tables.batches.push(batch);

  for (let index = 0; index < 20; index += 1) {
    if (index < published) {
      const user = Object.assign(new User(), { id: randomUUID(), email: `m${index}@devmentor.test`, roles: ['mentor'] });
      const profile = Object.assign(new MentorProfile(), { id: randomUUID(), user: { id: user.id }, displayName: `Mentor ${index}` });
      tables.users.push(user);
      tables.profiles.push(profile);
      tables.slots.push(Object.assign(new Slot(), { id: randomUUID(), mentorProfile: { id: profile.id }, createdAt: new Date(acceptedAt.getTime() + DAY_MS) }));
      tables.invitations.push(
        makeBatchInvitation(batch, { acceptedAt, acceptedBy: { id: user.id } as Invitation['acceptedBy'], publishDueAt: new Date(acceptedAt.getTime() + 14 * DAY_MS) }),
      );
    } else {
      tables.invitations.push(makeBatchInvitation(batch));
    }
  }

  return batch;
}

function emptyTables(): BatchTables {
  return { users: [], batches: [], invitations: [], profiles: [], slots: [] };
}

const NOW = new Date('2026-11-24T12:00:00.000Z');
const OPERATOR = { id: randomUUID(), roles: ['operator'] as ['operator'] };
const MENTOR = { id: randomUUID(), roles: ['mentor'] as ['mentor'] };

function setup(tables: BatchTables = emptyTables()) {
  const em = fakeBatchEm(tables);
  const logger = { info: vi.fn(), warn: vi.fn() };
  const service = new InvitationBatchService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    logger: logger as unknown as Cradle['logger'],
  });

  return { service, em, logger, tables };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

function uniqueViolation(constraint: string) {
  return new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint }));
}

describe('operatorRef and assertOperator', () => {
  it('names a session operator by id and the CLI by its operator name', () => {
    expect(operatorRef({ kind: 'session', user: OPERATOR })).toEqual({ id: OPERATOR.id });
    expect(operatorRef({ kind: 'cli', operator: 'alice' })).toEqual({ cli: 'alice' });
  });

  it('refuses a session actor without the operator role and trusts the CLI', () => {
    expect(() => assertOperator({ kind: 'session', user: MENTOR })).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertOperator({ kind: 'session', user: OPERATOR })).not.toThrow();
    expect(() => assertOperator({ kind: 'cli', operator: 'alice' })).not.toThrow();
  });
});

describe('InvitationBatchService.open', () => {
  it('opens batch 1 when none exists and logs the operator action with the number', async () => {
    const { service, tables, logger } = setup();

    await expect(service.open(OPERATOR)).resolves.toEqual({ number: 1, openedAt: NOW.toISOString() });

    expect(tables.batches).toHaveLength(1);
    expect(tables.batches[0]).toMatchObject({ number: 1, openedBy: OPERATOR.id, openedAt: NOW, closedAt: null });
    expect(logger.info).toHaveBeenCalledWith(
      { operator: { id: OPERATOR.id }, action: 'invitation-batch.open', target: { batch: { number: 1 } } },
      'Operator action',
    );
  });

  it('numbers the next batch max + 1 once the last one is full', async () => {
    const tables = emptyTables();
    tables.batches.push(makeBatch(1, { closedAt: NOW }), makeBatch(2, { closedAt: NOW }));
    const { service } = setup(tables);

    await expect(service.open(OPERATOR)).resolves.toMatchObject({ number: 3 });
  });

  it('refuses while a batch is open and creates nothing', async () => {
    const tables = emptyTables();
    tables.batches.push(makeBatch(1));
    const { service, logger } = setup(tables);

    const error = await rejection(service.open(OPERATOR));

    expect(error).toMatchObject({ status: 409, code: 'BATCH_ALREADY_OPEN', message: BATCH_ALREADY_OPEN_MESSAGE });
    expect(tables.batches).toHaveLength(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('refuses while stopped, checked before the open batch, and logs the refusal', async () => {
    const tables = emptyTables();
    decidedBatch1(tables, 4);
    tables.batches.push(makeBatch(2));
    const { service, logger } = setup(tables);

    const error = await rejection(service.open(OPERATOR));

    expect(error).toMatchObject({ status: 409, code: 'INVITATIONS_STOPPED', message: INVITATIONS_STOPPED_MESSAGE });
    expect(tables.batches).toHaveLength(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { operator: { id: OPERATOR.id }, action: 'invitation-batch.open', refused: 'INVITATIONS_STOPPED' },
      'Operator action refused',
    );
  });

  it('maps a lost race on either unique index to BATCH_ALREADY_OPEN and rethrows anything else', async () => {
    for (const constraint of [INVITATION_BATCH_NUMBER_UNIQUE, INVITATION_BATCH_ONE_OPEN_UNIQUE]) {
      const { service, em } = setup();
      em.state.failFlush = uniqueViolation(constraint);

      await expect(service.open(OPERATOR)).rejects.toMatchObject({ code: 'BATCH_ALREADY_OPEN' });
    }

    const { service, em } = setup();
    const other = new Error('connection lost');
    em.state.failFlush = other;

    await expect(service.open(OPERATOR)).rejects.toBe(other);
  });

  it('refuses a non-operator with 403 before touching the database', async () => {
    const { service, em } = setup();

    await expect(service.open(MENTOR)).rejects.toMatchObject({ status: 403 });
    expect(em.transactional).not.toHaveBeenCalled();
  });
});

describe('InvitationBatchService.assertCanInvite', () => {
  const cli = { cli: 'alice' };

  it('answers NO_OPEN_BATCH only when no batch was ever opened', async () => {
    const { service, em } = setup();

    await expect(service.assertCanInvite(em as unknown as Cradle['em'], NOW, cli, 'invitation.create')).rejects.toMatchObject({
      status: 409,
      code: 'NO_OPEN_BATCH',
      message: NO_OPEN_BATCH_MESSAGE,
    });
  });

  it('answers BATCH_FULL when batches exist but none is open after the lock (race loser)', async () => {
    const tables = emptyTables();
    tables.batches.push(makeBatch(1, { closedAt: NOW }));
    const { service, em } = setup(tables);

    await expect(service.assertCanInvite(em as unknown as Cradle['em'], NOW, cli, 'invitation.create')).rejects.toMatchObject({
      status: 409,
      code: 'BATCH_FULL',
      message: BATCH_FULL_MESSAGE,
    });
    expect(em.log).toContain('lock:InvitationBatch');
  });

  it('returns the locked open batch and its current count', async () => {
    const tables = emptyTables();
    const batch = makeBatch(1);
    tables.batches.push(batch);
    tables.invitations.push(makeBatchInvitation(batch), makeBatchInvitation(batch), makeBatchInvitation(null));
    const { service, em } = setup(tables);

    await expect(service.assertCanInvite(em as unknown as Cradle['em'], NOW, cli, 'invitation.create')).resolves.toEqual({ batch, sent: 2 });
  });

  it('refuses an open batch that somehow already holds 20 with BATCH_FULL', async () => {
    const tables = emptyTables();
    const batch = makeBatch(2);
    tables.batches.push(batch);
    tables.invitations.push(...Array.from({ length: 20 }, () => makeBatchInvitation(batch)));
    const { service, em } = setup(tables);

    await expect(service.assertCanInvite(em as unknown as Cradle['em'], NOW, cli, 'invitation.create')).rejects.toMatchObject({ code: 'BATCH_FULL' });
  });

  it('refuses while stopped before taking the lock, logging the CLI operator', async () => {
    const tables = emptyTables();
    decidedBatch1(tables, 0);
    tables.batches.push(makeBatch(2));
    const { service, em, logger } = setup(tables);

    await expect(service.assertCanInvite(em as unknown as Cradle['em'], NOW, cli, 'invitation.create')).rejects.toMatchObject({
      code: 'INVITATIONS_STOPPED',
    });
    expect(em.log).not.toContain('lock:InvitationBatch');
    expect(logger.info).toHaveBeenCalledWith(
      { operator: cli, action: 'invitation.create', refused: 'INVITATIONS_STOPPED' },
      'Operator action refused',
    );
  });

  it('evaluates the stop again after the lock: a revoke committed while waiting decides batch 1 (amendment 5)', async () => {
    const tables = emptyTables();
    const batch1 = decidedBatch1(tables, 4);
    // Undecided before the lock: one invitation is still waiting.
    const waiting = tables.invitations.find((row) => row.acceptedAt == null) as Invitation;
    waiting.expiresAt = new Date(NOW.getTime() + DAY_MS);
    tables.batches.push(makeBatch(2));
    const { service, em, logger } = setup(tables);
    em.state.onLock = () => {
      waiting.revokedAt = NOW;
    };

    await expect(service.assertCanInvite(em as unknown as Cradle['em'], NOW, cli, 'invitation.create')).rejects.toMatchObject({
      code: 'INVITATIONS_STOPPED',
    });
    expect(em.log.indexOf('lock:InvitationBatch')).toBeGreaterThan(-1);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(batch1.number).toBe(1);
  });
});

describe('InvitationBatchService.assertNotStopped', () => {
  const cli = { cli: 'alice' };
  const check = (tables: BatchTables) => {
    const { service, em } = setup(tables);
    return service.assertNotStopped(em as unknown as Cradle['em'], NOW, cli, 'invitation.resend');
  };

  it('passes without a batch 1, with 5 publishers, with fewer than 20 or when batch 1 was resumed', async () => {
    await expect(check(emptyTables())).resolves.toBeUndefined();

    const five = emptyTables();
    decidedBatch1(five, 5);
    await expect(check(five)).resolves.toBeUndefined();

    const short = emptyTables();
    decidedBatch1(short, 0);
    short.invitations.pop();
    await expect(check(short)).resolves.toBeUndefined();

    const resumed = emptyTables();
    decidedBatch1(resumed, 0).resumedAt = NOW;
    await expect(check(resumed)).resolves.toBeUndefined();
  });

  it('counts a slot removed later but not a slot created before acceptance', async () => {
    const tables = emptyTables();
    decidedBatch1(tables, 5);
    tables.slots[0].removedAt = NOW;
    await expect(check(tables)).resolves.toBeUndefined();

    tables.slots[1].createdAt = new Date('2026-10-01T00:00:00.000Z');
    await expect(check(tables)).rejects.toMatchObject({ code: 'INVITATIONS_STOPPED' });
  });

  it('stops with 4 publishers', async () => {
    const tables = emptyTables();
    decidedBatch1(tables, 4);

    await expect(check(tables)).rejects.toMatchObject({ code: 'INVITATIONS_STOPPED', message: INVITATIONS_STOPPED_MESSAGE });
  });
});

describe('InvitationBatchService.overview', () => {
  it('returns no batches, can open batch 1 and an empty before-batches list on a fresh system', async () => {
    const { service } = setup();

    await expect(service.overview(OPERATOR)).resolves.toEqual({
      stopped: false,
      canOpen: true,
      nextBatchNumber: 1,
      batches: [],
      beforeBatches: [],
    });
  });

  it('lists batches newest first with counts, states and rows in words; old rows under before batches', async () => {
    const tables = emptyTables();
    const first = makeBatch(1, { closedAt: new Date('2026-10-05T00:00:00.000Z') });
    const second = makeBatch(2);
    tables.batches.push(first, second);
    const acceptedAt = new Date('2026-11-20T00:00:00.000Z');
    const due = new Date(acceptedAt.getTime() + 14 * DAY_MS);
    const named = Object.assign(new User(), { id: randomUUID(), email: 'named@devmentor.test', roles: ['mentor'] });
    const blank = Object.assign(new User(), { id: randomUUID(), email: 'blank@devmentor.test', roles: ['mentor'] });
    const spaces = Object.assign(new User(), { id: randomUUID(), email: 'spaces@devmentor.test', roles: ['mentor'] });
    const noProfile = Object.assign(new User(), { id: randomUUID(), email: 'noprofile@devmentor.test', roles: ['mentor'] });
    const unnamed = Object.assign(new User(), { id: randomUUID(), email: 'unnamed@devmentor.test', roles: ['mentor'] });
    tables.users.push(named, blank, spaces, noProfile, unnamed);
    const namedProfile = Object.assign(new MentorProfile(), { id: randomUUID(), user: { id: named.id }, displayName: 'Ada Lovelace' });
    tables.profiles.push(
      namedProfile,
      Object.assign(new MentorProfile(), { id: randomUUID(), user: { id: blank.id }, displayName: '' }),
      Object.assign(new MentorProfile(), { id: randomUUID(), user: { id: spaces.id }, displayName: '   ' }),
      Object.assign(new MentorProfile(), { id: randomUUID(), user: { id: unnamed.id }, displayName: null }),
    );
    tables.slots.push(Object.assign(new Slot(), { id: randomUUID(), mentorProfile: { id: namedProfile.id }, createdAt: acceptedAt }));
    const accept = (user: User) => ({ acceptedAt, acceptedBy: { id: user.id } as Invitation['acceptedBy'], publishDueAt: due, email: `invited-${user.email}` });
    const rows = [
      makeBatchInvitation(second, { ...accept(named), stackTags: ['react', 'typescript'], createdAt: new Date('2026-11-01T00:00:00.000Z') }),
      makeBatchInvitation(second, { ...accept(blank), createdAt: new Date('2026-11-02T00:00:00.000Z') }),
      makeBatchInvitation(second, { ...accept(spaces), createdAt: new Date('2026-11-03T00:00:00.000Z') }),
      makeBatchInvitation(second, { ...accept(noProfile), createdAt: new Date('2026-11-04T00:00:00.000Z') }),
      makeBatchInvitation(second, { ...accept(unnamed), createdAt: new Date('2026-11-05T00:00:00.000Z') }),
      makeBatchInvitation(second, { email: 'waiting@devmentor.test', expiresAt: new Date('2026-12-01T00:00:00.000Z'), createdAt: new Date('2026-11-06T00:00:00.000Z') }),
      makeBatchInvitation(first, { email: 'revoked@devmentor.test', revokedAt: NOW }),
      makeBatchInvitation(null, { email: 'old@devmentor.test', createdAt: new Date('2026-09-01T00:00:00.000Z') }),
    ];
    tables.invitations.push(...rows.reverse());
    const { service } = setup(tables);

    const overview = await service.overview(OPERATOR);

    expect(overview).toMatchObject({ stopped: false, canOpen: false, nextBatchNumber: 3 });
    expect(overview.batches.map((batch) => [batch.number, batch.state, batch.closedAt])).toEqual([
      [2, 'open', null],
      [1, 'full', '2026-10-05T00:00:00.000Z'],
    ]);
    expect(overview.batches[0].openedAt).toBe(second.openedAt.toISOString());
    expect(overview.batches[0].counts).toEqual({ sent: 6, accepted: 5, published: 1 });
    expect(overview.batches[1].counts).toEqual({ sent: 1, accepted: 0, published: 0 });
    expect(overview.batches[0].invitations.map((row) => [row.email, row.mentorName, row.status])).toEqual([
      ['invited-named@devmentor.test', 'Ada Lovelace', 'published'],
      ['invited-blank@devmentor.test', 'blank@devmentor.test', 'accepted_no_slot'],
      ['invited-spaces@devmentor.test', 'spaces@devmentor.test', 'accepted_no_slot'],
      ['invited-noprofile@devmentor.test', 'noprofile@devmentor.test', 'accepted_no_slot'],
      ['invited-unnamed@devmentor.test', 'unnamed@devmentor.test', 'accepted_no_slot'],
      ['waiting@devmentor.test', null, 'waiting'],
    ]);
    expect(overview.batches[0].invitations[0]).toEqual({
      id: expect.any(String),
      email: 'invited-named@devmentor.test',
      mentorName: 'Ada Lovelace',
      stackTags: ['react', 'typescript'],
      status: 'published',
      publishDueAt: due.toISOString(),
    });
    expect(overview.batches[0].invitations[5].publishDueAt).toBeNull();
    expect(overview.batches[1].invitations[0].status).toBe('revoked');
    expect(overview.beforeBatches.map((row) => [row.email, row.status])).toEqual([['old@devmentor.test', 'expired']]);
    expect(JSON.stringify(overview)).not.toMatch(/tokenHash|token/);
  });

  it('marks batch 1 and the open batch stopped and refuses to offer an open while stopped', async () => {
    const tables = emptyTables();
    decidedBatch1(tables, 4);
    tables.batches.push(makeBatch(2));
    const { service } = setup(tables);

    const overview = await service.overview(OPERATOR);

    expect(overview).toMatchObject({ stopped: true, canOpen: false, nextBatchNumber: 3 });
    expect(overview.batches.map((batch) => [batch.number, batch.state])).toEqual([
      [2, 'stopped'],
      [1, 'stopped'],
    ]);
    expect(overview.batches[1].counts).toEqual({ sent: 20, accepted: 4, published: 4 });
  });

  it('offers the next batch once the open one is full and nothing is stopped', async () => {
    const tables = emptyTables();
    tables.batches.push(makeBatch(1, { closedAt: NOW }));
    const { service } = setup(tables);

    await expect(service.overview(OPERATOR)).resolves.toMatchObject({ canOpen: true, nextBatchNumber: 2 });
  });

  it('refuses a non-operator with 403', async () => {
    const { service, em } = setup();

    await expect(service.overview(MENTOR)).rejects.toMatchObject({ status: 403 });
    expect(em.find).not.toHaveBeenCalled();
  });
});
