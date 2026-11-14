import {
  Invitation,
  LockMode,
  MentorProfile,
  STACK_TAGS,
  UniqueConstraintViolationException,
  User,
  type Role,
  type StackTag,
} from '@devmentor/db';
import { z } from 'zod';
import type { SessionUser } from '../../auth/session-user';
import type { Cradle } from '../../container/cradle';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../http/errors';
import { hashToken, randomToken } from '../../security/token';
import { emailField, linkTokenField } from '../../validators/auth/fields';
import { normalizeEmail } from '../auth/account.service';

const DAY_MS = 86_400_000;

/** The one answer for an unknown, expired, revoked or used link (lookup and accept alike). */
export const INVITATION_INVALID_MESSAGE = 'This invitation is not valid.';
export const INVITATION_EMAIL_MISMATCH_MESSAGE =
  'This invitation is for a different email address. Sign in with the invited, verified email.';
export const ALREADY_MENTOR_MESSAGE = 'You are already a mentor.';
export const EMAIL_IS_MENTOR_MESSAGE = 'This email already belongs to a mentor.';
export const ALREADY_INVITED_MESSAGE =
  'This email already has an unresolved invitation (pending or expired): resend or revoke it first.';

/**
 * The invitation was already accepted by the very account presenting it (a second tab, a reload):
 * the page says "You are already a mentor." (L07). Only that account learns it; anyone else gets
 * the generic 404, so a used link reveals nothing.
 */
export class AlreadyMentorError extends AppError {
  constructor(message = ALREADY_MENTOR_MESSAGE, options?: ErrorOptions) {
    super(409, 'ALREADY_MENTOR', message, options);
  }
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** Operator view of an invitation: never the token or its hash. */
export interface InvitationView {
  id: string;
  email: string;
  stackTags: StackTag[];
  batch: string | null;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  publishDueAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateInvitationInput {
  email: string;
  tags: readonly string[];
  batch?: string;
  /** Who issued it, for the audit line only (not stored). */
  operator: string;
}

/** `link` carries the raw token: print it once, never log it. */
export interface InvitationWithLink {
  invitation: InvitationView;
  link: string;
}

export interface InvitationLookup {
  email: string;
  stackTags: StackTag[];
}

export interface AcceptInvitationResult {
  roles: Role[];
  publishDueAt: Date;
  /** The user's `session_version` after the commit: the route signs the re-issued `dm_session` with it. */
  sessionVersion: number;
  /** `true` when `mentor` was new (and `session_version` was bumped). */
  changed: boolean;
}

export interface ListInvitationsInput {
  batch?: string;
}

/**
 * Built at call time, like `lockForUpdate`: a module-level use of `STACK_TAGS` would break tests
 * that mock `@devmentor/db` partially (lesson 2026-10-26).
 */
function createSchema() {
  return z.object({
    email: emailField,
    tags: z
      .array(z.enum(STACK_TAGS, `Unknown stack tag. Use: ${STACK_TAGS.join(', ')}.`))
      .min(1, `Give at least one stack tag: ${STACK_TAGS.join(', ')}.`)
      // Deduplicated in the stable STACK_TAGS order.
      .transform((tags) => STACK_TAGS.filter((tag) => tags.includes(tag))),
    batch: z.string().trim().min(1, 'Batch must not be empty.').optional(),
    operator: z.string({ error: 'Give the operator name.' }).trim().min(1, 'Give the operator name.'),
  });
}

const idSchema = z.uuid();

/** `SELECT … FOR UPDATE` that re-reads the row (lesson 2026-10-26); built at call time. */
function lockForUpdate() {
  return { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as const;
}

function statusOf(invitation: Invitation, now: Date): InvitationStatus {
  if (invitation.revokedAt != null) {
    return 'revoked';
  }

  if (invitation.acceptedAt != null) {
    return 'accepted';
  }

  return invitation.expiresAt <= now ? 'expired' : 'pending';
}

function toView(invitation: Invitation, now: Date): InvitationView {
  return {
    id: invitation.id,
    email: invitation.email,
    stackTags: [...invitation.stackTags],
    batch: invitation.batch ?? null,
    status: statusOf(invitation, now),
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt ?? null,
    publishDueAt: invitation.publishDueAt ?? null,
    revokedAt: invitation.revokedAt ?? null,
  };
}

type InvitationServiceDeps = Pick<Cradle, 'em' | 'env' | 'clock' | 'events' | 'logger' | 'accountService'>;

/**
 * Mentor invitations (spec 2026-10-21-mentor-invitations): the operator creates, revokes, resends
 * and lists them by hand (`invite` CLI); the invited engineer looks one up and accepts it. Only the
 * SHA-256 of a token is stored. Every writer of an invitation row holds it `FOR UPDATE`, and accept
 * locks the user row first, so accept, revoke and resend serialize and never apply partially.
 */
export class InvitationService {
  private readonly em: Cradle['em'];
  private readonly env: Cradle['env'];
  private readonly clock: Cradle['clock'];
  private readonly events: Cradle['events'];
  private readonly logger: Cradle['logger'];
  private readonly accountService: Cradle['accountService'];

  constructor({ em, env, clock, events, logger, accountService }: InvitationServiceDeps) {
    this.em = em;
    this.env = env;
    this.clock = clock;
    this.events = events;
    this.logger = logger;
    this.accountService = accountService;
  }

  /**
   * A new pending invitation and its link. Refused when the email belongs to a current mentor, or
   * when it already has an unresolved invitation (the partial unique index decides, so two parallel
   * creates leave one row; an expired one counts: resend or revoke it first).
   */
  async create(input: CreateInvitationInput): Promise<InvitationWithLink> {
    const parsed = createSchema().safeParse(input);

    if (!parsed.success) {
      throw new ValidationError('Invalid invitation.', z.flattenError(parsed.error).fieldErrors);
    }

    const { email, tags, batch, operator } = parsed.data;
    const appUrl = this.requireAppUrl();
    const holder = await this.em.findOne(User, { email });

    if (holder?.roles.includes('mentor') === true) {
      throw new ConflictError(EMAIL_IS_MENTOR_MESSAGE);
    }

    const token = randomToken();
    const now = this.clock.now();
    const invitation = this.em.create(Invitation, {
      email,
      tokenHash: hashToken(token),
      stackTags: tags,
      batch: batch ?? null,
      expiresAt: this.daysFrom(now, this.env.INVITATION_TTL_DAYS),
    });

    try {
      await this.em.flush();
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error;
      }

      // Drop the failed insert from the unit of work.
      this.em.clear();
      throw new ConflictError(ALREADY_INVITED_MESSAGE);
    }

    this.logger.info(
      {
        invitationId: invitation.id,
        operator,
        batch: batch ?? null,
        stackTags: tags,
      },
      'Invitation created',
    );

    return {
      invitation: toView(invitation, now),
      link: this.link(appUrl, token),
    };
  }

  /**
   * What the invitation page shows for a valid token, else `null` for every invalid state
   * (malformed, unknown, expired, revoked, used): the page renders one sentence for all of them.
   */
  async find(token: string): Promise<InvitationLookup | null> {
    const tokenHash = this.tokenHashOf(token);

    if (tokenHash === null) {
      return null;
    }

    const invitation = await this.em.findOne(Invitation, { tokenHash });

    if (invitation === null || !this.isPending(invitation, this.clock.now())) {
      return null;
    }

    return { email: invitation.email, stackTags: [...invitation.stackTags] };
  }

  /** `find` for the API: one 404 for every invalid state. */
  async lookup(token: string): Promise<InvitationLookup> {
    const found = await this.find(token);

    if (found === null) {
      throw new NotFoundError(INVITATION_INVALID_MESSAGE);
    }

    return found;
  }

  /**
   * Grants `mentor` to the signed-in account in one transaction: user row locked first, then the
   * invitation row. Order of answers: the token (404 for unknown, expired, revoked, used — except
   * 409 `ALREADY_MENTOR` to the account that used it), then identity (unverified or another email →
   * 403). Creates the `MentorProfile` on the first acceptance; a later one never moves its
   * `initialPublishDueAt`. `auth.user.roles_changed` and `invitations.invitation.accepted` go out
   * after the commit.
   */
  async accept(token: string, sessionUser: Pick<SessionUser, 'id'>): Promise<AcceptInvitationResult> {
    const tokenHash = this.tokenHashOf(token);

    if (tokenHash === null) {
      throw new NotFoundError(INVITATION_INVALID_MESSAGE);
    }

    const accepted = await this.em.transactional(async (em) => {
      const now = this.clock.now();
      const user = await em.findOne(User, { id: sessionUser.id }, lockForUpdate());

      if (user === null) {
        throw new UnauthorizedError();
      }

      const invitation = await em.findOne(Invitation, { tokenHash }, lockForUpdate());

      if (invitation === null || !this.isPending(invitation, now)) {
        if (invitation?.acceptedBy?.id === user.id && user.roles.includes('mentor')) {
          throw new AlreadyMentorError();
        }

        throw new NotFoundError(INVITATION_INVALID_MESSAGE);
      }

      if (user.emailVerifiedAt == null || normalizeEmail(user.email) !== invitation.email) {
        this.logger.warn(
          { userId: user.id, invitationId: invitation.id },
          'Invitation refused: email mismatch or unverified',
        );
        throw new ForbiddenError(INVITATION_EMAIL_MISMATCH_MESSAGE);
      }

      const grant = await this.accountService.grantRole(em, user, 'mentor');
      const publishDueAt = this.daysFrom(now, this.env.MENTOR_PUBLISH_WINDOW_DAYS);
      em.assign(invitation, {
        acceptedAt: now,
        acceptedBy: user,
        publishDueAt,
      });

      const profile = await em.findOne(MentorProfile, { user: user.id });

      if (profile === null) {
        em.create(MentorProfile, { user, initialPublishDueAt: publishDueAt });
      } else {
        // Never reset by a later acceptance; filled only if an earlier path left it empty.
        profile.initialPublishDueAt ??= publishDueAt;
      }

      return {
        grant,
        invitationId: invitation.id,
        userId: user.id,
        sessionVersion: user.sessionVersion,
        publishDueAt,
      };
    });

    this.logger.info({ invitationId: accepted.invitationId, userId: accepted.userId }, 'Invitation accepted');
    await accepted.grant.afterCommit();
    await this.events.emit('invitations.invitation.accepted', {
      invitationId: accepted.invitationId,
      userId: accepted.userId,
      publishDueAt: accepted.publishDueAt,
    });

    return {
      roles: accepted.grant.roles,
      publishDueAt: accepted.publishDueAt,
      sessionVersion: accepted.sessionVersion,
      changed: accepted.grant.changed,
    };
  }

  /** Revokes an unresolved (pending or expired) invitation; accepted or revoked ones → 409. */
  async revoke(id: string): Promise<InvitationView> {
    return this.em.transactional(async (em) => {
      const now = this.clock.now();
      const invitation = await this.lockUnresolved(em, id, 'revoked');
      invitation.revokedAt = now;
      this.logger.info({ invitationId: invitation.id }, 'Invitation revoked');

      return toView(invitation, now);
    });
  }

  /** New token and expiry for an unresolved invitation (the old link stops working); returns the new link. */
  async resend(id: string): Promise<InvitationWithLink> {
    const appUrl = this.requireAppUrl();
    const token = randomToken();
    const invitation = await this.em.transactional(async (em) => {
      const now = this.clock.now();
      const locked = await this.lockUnresolved(em, id, 'resent');
      locked.tokenHash = hashToken(token);
      locked.expiresAt = this.daysFrom(now, this.env.INVITATION_TTL_DAYS);

      return toView(locked, now);
    });

    this.logger.info({ invitationId: invitation.id }, 'Invitation resent');

    return { invitation, link: this.link(appUrl, token) };
  }

  /** Operator list (oldest first), optionally one batch; never tokens. */
  async list({ batch }: ListInvitationsInput = {}): Promise<InvitationView[]> {
    const now = this.clock.now();
    const rows = await this.em.find(Invitation, batch === undefined ? {} : { batch }, {
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => toView(row, now));
  }

  private async lockUnresolved(em: Cradle['em'], id: string, action: 'revoked' | 'resent'): Promise<Invitation> {
    const invitation = idSchema.safeParse(id).success ? await em.findOne(Invitation, { id }, lockForUpdate()) : null;

    if (invitation === null) {
      throw new NotFoundError('Invitation not found.');
    }

    if (invitation.acceptedAt != null) {
      throw new ConflictError(`An accepted invitation cannot be ${action}.`);
    }

    if (invitation.revokedAt != null) {
      throw new ConflictError(`A revoked invitation cannot be ${action}.`);
    }

    return invitation;
  }

  /** SHA-256 of a well-formed link token (`linkTokenField`), else `null`: never hash or query arbitrary input. */
  private tokenHashOf(token: string): string | null {
    return linkTokenField.safeParse(token).success ? hashToken(token) : null;
  }

  private isPending(invitation: Invitation, now: Date): boolean {
    return statusOf(invitation, now) === 'pending';
  }

  private daysFrom(now: Date, days: number): Date {
    return new Date(now.getTime() + days * DAY_MS);
  }

  private link(appUrl: string, token: string): string {
    return `${appUrl}/invitation/${token}`;
  }

  /** Links need `APP_URL`; without it nothing is written and the caller gets 503. */
  private requireAppUrl(): string {
    if (this.env.APP_URL === undefined) {
      this.logger.warn('APP_URL is not set: invitation links cannot be built');
      throw new ServiceUnavailableError('Invitations are unavailable.');
    }

    return this.env.APP_URL;
  }
}
