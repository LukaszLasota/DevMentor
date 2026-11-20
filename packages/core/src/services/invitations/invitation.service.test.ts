import { randomUUID } from 'node:crypto';
import { Invitation, LockMode, MentorProfile, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { isAppError } from '../../http/errors';
import { hashToken } from '../../security/token';
import { AccountService } from '../auth/account.service';
import {
  ALREADY_INVITED_MESSAGE,
  ALREADY_MENTOR_MESSAGE,
  AlreadyMentorError,
  EMAIL_IS_MENTOR_MESSAGE,
  INVITATION_EMAIL_MISMATCH_MESSAGE,
  INVITATION_INVALID_MESSAGE,
  InvitationService,
} from './invitation.service';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const EARLIER = new Date('2026-10-01T08:00:00.000Z');
const DAY_MS = 86_400_000;
const APP_URL = 'https://app.devmentor.test';
const EMAIL = 'ada@devmentor.test';
const TOKEN = 'raw-token-of-the-link';
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: randomUUID(),
    email: EMAIL,
    roles: ['mentee'],
    sessionVersion: 3,
    emailVerifiedAt: EARLIER,
    ...overrides,
  });
}

function makeInvitation(overrides: Partial<Invitation> & { token?: string } = {}): Invitation {
  const { token = TOKEN, ...fields } = overrides;

  return Object.assign(new Invitation(), {
    id: randomUUID(),
    email: EMAIL,
    tokenHash: hashToken(token),
    stackTags: ['typescript'],
    batch: '2026-11-a',
    expiresAt: new Date(NOW.getTime() + DAY_MS),
    acceptedAt: null,
    acceptedBy: null,
    publishDueAt: null,
    revokedAt: null,
    createdAt: EARLIER,
    ...fields,
  });
}

type Row = Record<string, unknown>;

/** Equal fields; a string compared with a reference's `id` (`{ user: userId }`). */
function matches(row: object, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as Row)[key];

    if (typeof expected === 'string' && actual !== null && typeof actual === 'object' && 'id' in actual) {
      return actual.id === expected;
    }

    return actual === expected;
  });
}

interface Tables {
  users: User[];
  invitations: Invitation[];
  profiles: MentorProfile[];
}

/**
 * In-memory stand-in for the scoped `EntityManager` over users, invitations and mentor profiles.
 * Rows are the managed entities themselves; `transactional` runs the callback on the same fake,
 * then flushes (a throw skips the flush, like a rollback); `log` records the order of calls.
 */
function fakeEm({ users, invitations, profiles }: Tables) {
  const table = (entity: unknown): object[] => {
    if (entity === Invitation) return invitations;
    if (entity === MentorProfile) return profiles;
    return users;
  };
  const log: string[] = [];
  const em = {
    log,
    findOne: vi.fn(async (entity: unknown, where: Row) => {
      log.push(`findOne:${(entity as { name: string }).name}`);
      return table(entity).find((row) => matches(row, where)) ?? null;
    }),
    find: vi.fn(async (entity: unknown, where: Row) =>
      table(entity).filter((row) => matches(row, where)),
    ),
    create: vi.fn((entity: unknown, data: Row) => {
      const row =
        entity === Invitation
          ? Object.assign(new Invitation(), {
              id: randomUUID(),
              createdAt: NOW,
              ...data,
            })
          : Object.assign(new MentorProfile(), { id: randomUUID(), ...data });
      table(entity).push(row);
      return row;
    }),
    assign: vi.fn((entity: object, data: Row) => Object.assign(entity, data)),
    flush: vi.fn(async () => {
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

interface SetupOptions {
  users?: User[];
  invitations?: Invitation[];
  profiles?: MentorProfile[];
  env?: Record<string, string>;
  appUrl?: string | null;
}

function setup(options: SetupOptions = {}) {
  const tables: Tables = {
    users: options.users ?? [],
    invitations: options.invitations ?? [],
    profiles: options.profiles ?? [],
  };
  const em = fakeEm(tables);
  const events = {
    emit: vi.fn(async (event: string) => {
      em.log.push(`emit:${event}`);
    }),
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const appUrl = options.appUrl === undefined ? APP_URL : options.appUrl;
  const env = parseEnv({
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    ...(appUrl === null ? {} : { APP_URL: appUrl }),
    ...options.env,
  });
  const deps = {
    em: em as unknown as Cradle['em'],
    env,
    clock: { now: () => NOW },
    events: events as unknown as Cradle['events'],
    logger: logger as unknown as Cradle['logger'],
  };
  const accountService = new AccountService({
    ...deps,
    mailSender: { send: vi.fn() },
    passwordHasher: {} as Cradle['passwordHasher'],
    rateLimiter: {} as Cradle['rateLimiter'],
  });
  const slotService = { countBookable: vi.fn<Cradle['slotService']['countBookable']>(async () => 0) };
  const grantRole = vi.spyOn(accountService, 'grantRole');
  const service = new InvitationService({ ...deps, accountService, slotService: slotService as unknown as Cradle['slotService'] });

  return { service, em, events, logger, grantRole, slotService, ...tables };
}

function tokenOf(link: string): string {
  return link.slice(`${APP_URL}/invitation/`.length);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

const VALID_CREATE = {
  email: '  Ada@DevMentor.TEST ',
  tags: ['react', 'typescript', 'react'],
  batch: ' 2026-11-a ',
  operator: ' alice ',
};

describe('InvitationService.create', () => {
  it('normalizes the email, dedupes tags, stores only the token hash and returns the link once', async () => {
    const { service, invitations, logger } = setup();

    const { invitation, link } = await service.create(VALID_CREATE);

    expect(link).toMatch(new RegExp(`^${APP_URL}/invitation/[A-Za-z0-9_-]{43}$`));
    const [row] = invitations;
    expect(row).toMatchObject({
      email: EMAIL,
      stackTags: ['typescript', 'react'],
      batch: '2026-11-a',
      tokenHash: hashToken(tokenOf(link)),
      expiresAt: new Date(NOW.getTime() + 14 * DAY_MS),
    });
    expect(invitation).toEqual({
      id: row.id,
      email: EMAIL,
      stackTags: ['typescript', 'react'],
      batch: '2026-11-a',
      status: 'pending',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 14 * DAY_MS),
      acceptedAt: null,
      publishDueAt: null,
      revokedAt: null,
      bookableSlots: null,
      d13: null,
    });
    expect(JSON.stringify(invitation)).not.toContain(tokenOf(link));
    expect(logger.info).toHaveBeenCalledWith(
      {
        invitationId: row.id,
        operator: 'alice',
        batch: '2026-11-a',
        stackTags: ['typescript', 'react'],
      },
      'Invitation created',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(tokenOf(link));
  });

  it('uses INVITATION_TTL_DAYS and stores no batch when none is given', async () => {
    const { service, invitations, logger } = setup({
      env: { INVITATION_TTL_DAYS: '3' },
    });

    const { invitation } = await service.create({
      email: EMAIL,
      tags: ['python'],
      operator: 'alice',
    });

    expect(invitation).toMatchObject({
      batch: null,
      expiresAt: new Date(NOW.getTime() + 3 * DAY_MS),
    });
    expect(invitations[0].batch).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ batch: null }), 'Invitation created');
  });

  it.each([
    ['an unknown tag', { tags: ['typescript', 'cobol'] }, 'tags'],
    ['no tags', { tags: [] }, 'tags'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['an empty operator', { operator: '  ' }, 'operator'],
    ['an empty batch', { batch: ' ' }, 'batch'],
  ])('refuses %s with a field error and writes nothing', async (_case, override, field) => {
    const { service, em } = setup();

    const error = await rejection(service.create({ ...VALID_CREATE, ...override }));

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect((error as { fieldErrors: Record<string, string[]> }).fieldErrors[field]).toHaveLength(1);
    expect(em.create).not.toHaveBeenCalled();
  });

  it('answers 503 without APP_URL and writes nothing', async () => {
    const { service, em, logger } = setup({ appUrl: null });

    await expect(service.create(VALID_CREATE)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(em.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('APP_URL is not set: invitation links cannot be built');
  });

  it('refuses an email that belongs to a current mentor', async () => {
    const { service, em } = setup({
      users: [makeUser({ roles: ['mentee', 'mentor'] })],
    });

    await expect(service.create(VALID_CREATE)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: EMAIL_IS_MENTOR_MESSAGE,
    });
    expect(em.findOne).toHaveBeenCalledWith(User, { email: EMAIL }, LOCK);
    expect(em.create).not.toHaveBeenCalled();
    expect(em.log).toEqual(['begin', 'findOne:User']);
  });

  it('checks the invitee under the user row lock and inserts in the same transaction', async () => {
    const { service, em, invitations } = setup({
      users: [makeUser({ roles: ['mentee'] })],
    });

    await service.create(VALID_CREATE);

    expect(em.findOne).toHaveBeenCalledWith(User, { email: EMAIL }, LOCK);
    expect(em.log).toEqual(['begin', 'findOne:User', 'flush', 'commit']);
    expect(invitations).toHaveLength(1);
  });

  it('create after a committed accept: the locked re-read sees mentor, 409, nothing inserted', async () => {
    const user = makeUser({ roles: ['mentee'] });
    const { service, em, invitations } = setup({ users: [user] });
    // The lock is granted once accept commits; the refreshed row already holds mentor.
    em.findOne.mockImplementationOnce(async (_entity: unknown, _where: Row, options?: unknown) => {
      em.log.push('findOne:User');
      expect(options).toEqual(LOCK);
      user.roles = ['mentee', 'mentor'];
      return user;
    });

    await expect(service.create(VALID_CREATE)).rejects.toMatchObject({ status: 409, message: EMAIL_IS_MENTOR_MESSAGE });
    expect(invitations).toHaveLength(0);
  });

  it('invites an existing account that is not a mentor (a mentee or an operator)', async () => {
    const { service, invitations } = setup({
      users: [makeUser({ roles: ['mentee', 'operator'] })],
    });

    await service.create(VALID_CREATE);

    expect(invitations).toHaveLength(1);
  });

  it('concurrent create: the partial unique index refusal becomes 409 "already invited"', async () => {
    const { service, em } = setup();
    em.flush.mockRejectedValueOnce(new UniqueConstraintViolationException(new Error('duplicate key')));

    await expect(service.create(VALID_CREATE)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: ALREADY_INVITED_MESSAGE,
    });
    expect(em.clear).toHaveBeenCalledTimes(1);
  });

  it('rethrows any other flush failure', async () => {
    const { service, em } = setup();
    const failure = new Error('connection lost');
    em.flush.mockRejectedValueOnce(failure);

    await expect(service.create(VALID_CREATE)).rejects.toBe(failure);
    expect(em.clear).not.toHaveBeenCalled();
  });
});

describe('InvitationService.lookup', () => {
  it('returns the invited email and stack tags of a pending invitation', async () => {
    const { service } = setup({
      invitations: [makeInvitation({ stackTags: ['react', 'python'] })],
    });

    await expect(service.lookup(TOKEN)).resolves.toEqual({
      email: EMAIL,
      stackTags: ['react', 'python'],
    });
  });

  it.each([
    ['unknown', [] as Invitation[]],
    ['expired', [makeInvitation({ expiresAt: NOW })]],
    ['revoked', [makeInvitation({ revokedAt: EARLIER })]],
    [
      'used',
      [
        makeInvitation({
          acceptedAt: EARLIER,
          acceptedBy: makeUser() as unknown as Invitation['acceptedBy'],
        }),
      ],
    ],
  ])('answers one 404 for an %s token', async (_state, invitations) => {
    const { service } = setup({ invitations });

    await expect(service.lookup(TOKEN)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: INVITATION_INVALID_MESSAGE,
    });
  });
});

describe('InvitationService.find', () => {
  it('returns the lookup of a pending invitation and null for any invalid state', async () => {
    const { service } = setup({
      invitations: [makeInvitation(), makeInvitation({ token: 'used-token', acceptedAt: EARLIER })],
    });

    await expect(service.find(TOKEN)).resolves.toEqual({ email: EMAIL, stackTags: ['typescript'] });
    await expect(service.find('used-token')).resolves.toBeNull();
    await expect(service.find('unknown-token')).resolves.toBeNull();
  });

  it.each([
    ['empty', ''],
    ['non-base64url', 'not a token/..'],
    ['oversized', 'a'.repeat(257)],
  ])('answers null for an %s token without querying', async (_case, token) => {
    const { service, em } = setup({ invitations: [makeInvitation()] });

    await expect(service.find(token)).resolves.toBeNull();
    await expect(service.lookup(token)).rejects.toMatchObject({ status: 404, message: INVITATION_INVALID_MESSAGE });
    expect(em.findOne).not.toHaveBeenCalled();
  });
});

describe('InvitationService.accept', () => {
  it('locks the user then the invitation, grants mentor, stores the acceptance and creates the profile', async () => {
    const user = makeUser();
    const invitation = makeInvitation();
    const { service, em, grantRole, profiles } = setup({
      users: [user],
      invitations: [invitation],
    });

    const result = await service.accept(TOKEN, { id: user.id });

    const publishDueAt = new Date(NOW.getTime() + 14 * DAY_MS);
    expect(result).toEqual({
      roles: ['mentee', 'mentor'],
      publishDueAt,
      sessionVersion: 4,
      changed: true,
    });
    expect(em.findOne.mock.calls.slice(0, 2)).toEqual([
      [User, { id: user.id }, LOCK],
      [Invitation, { tokenHash: hashToken(TOKEN) }, LOCK],
    ]);
    expect(grantRole).toHaveBeenCalledExactlyOnceWith(em, user, 'mentor');
    expect(user).toMatchObject({
      roles: ['mentee', 'mentor'],
      sessionVersion: 4,
    });
    expect(invitation).toMatchObject({
      acceptedAt: NOW,
      acceptedBy: user,
      publishDueAt,
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      user,
      initialPublishDueAt: publishDueAt,
    });
  });

  it('emits roles_changed and invitation.accepted only after the commit', async () => {
    const user = makeUser();
    const invitation = makeInvitation();
    const { service, em, events, logger } = setup({
      users: [user],
      invitations: [invitation],
    });

    const { publishDueAt } = await service.accept(TOKEN, { id: user.id });

    expect(em.log.slice(em.log.indexOf('commit'))).toEqual([
      'commit',
      'emit:auth.user.roles_changed',
      'emit:invitations.invitation.accepted',
    ]);
    expect(events.emit).toHaveBeenLastCalledWith('invitations.invitation.accepted', {
      invitationId: invitation.id,
      userId: user.id,
      publishDueAt,
    });
    expect(logger.info).toHaveBeenCalledWith({ invitationId: invitation.id, userId: user.id }, 'Invitation accepted');
  });

  it('uses MENTOR_PUBLISH_WINDOW_DAYS for the publish-by date', async () => {
    const user = makeUser();
    const { service } = setup({
      users: [user],
      invitations: [makeInvitation()],
      env: { MENTOR_PUBLISH_WINDOW_DAYS: '7' },
    });

    const { publishDueAt } = await service.accept(TOKEN, { id: user.id });

    expect(publishDueAt).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
  });

  it('an operator keeps operator and mentee and also holds mentor', async () => {
    const user = makeUser({ roles: ['mentee', 'operator'] });
    const { service } = setup({
      users: [user],
      invitations: [makeInvitation()],
    });

    const { roles } = await service.accept(TOKEN, { id: user.id });

    expect(roles).toEqual(['mentee', 'mentor', 'operator']);
  });

  it('matches the normalized account email', async () => {
    const user = makeUser({ email: '  ADA@devmentor.test' });
    const { service } = setup({
      users: [user],
      invitations: [makeInvitation()],
    });

    await expect(service.accept(TOKEN, { id: user.id })).resolves.toMatchObject({ changed: true });
  });

  it.each([
    ['another email', { email: 'grace@devmentor.test' }],
    ['an unverified account', { emailVerifiedAt: null }],
  ])('refuses %s with 403 and changes nothing', async (_case, overrides) => {
    const user = makeUser(overrides);
    const invitation = makeInvitation();
    const { service, events, grantRole, profiles, logger } = setup({
      users: [user],
      invitations: [invitation],
    });

    await expect(service.accept(TOKEN, { id: user.id })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: INVITATION_EMAIL_MISMATCH_MESSAGE,
    });
    expect(grantRole).not.toHaveBeenCalled();
    expect(user).toMatchObject({ roles: ['mentee'], sessionVersion: 3 });
    expect(invitation).toMatchObject({
      acceptedAt: null,
      acceptedBy: null,
      publishDueAt: null,
    });
    expect(profiles).toHaveLength(0);
    expect(events.emit).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: user.id, invitationId: invitation.id },
      'Invitation refused: email mismatch or unverified',
    );
  });

  it.each([
    ['unknown', [] as Invitation[]],
    ['expired', [makeInvitation({ expiresAt: NOW })]],
    ['revoked', [makeInvitation({ revokedAt: EARLIER })]],
    [
      'used by another account',
      [
        makeInvitation({
          acceptedAt: EARLIER,
          acceptedBy: makeUser() as unknown as Invitation['acceptedBy'],
        }),
      ],
    ],
  ])('answers 404 for an %s token before checking identity', async (_state, invitations) => {
    // A mismatched, unverified caller still gets the 404: the role never reveals a once-valid token.
    const user = makeUser({
      email: 'grace@devmentor.test',
      emailVerifiedAt: null,
    });
    const { service, grantRole, events, profiles } = setup({
      users: [user],
      invitations,
    });

    await expect(service.accept(TOKEN, { id: user.id })).rejects.toMatchObject({
      status: 404,
      message: INVITATION_INVALID_MESSAGE,
    });
    expect(grantRole).not.toHaveBeenCalled();
    expect(profiles).toHaveLength(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a used link opened again by the mentor who used it: 409 ALREADY_MENTOR, the role is not granted again', async () => {
    const user = makeUser({ roles: ['mentee', 'mentor'], sessionVersion: 4 });
    const invitation = makeInvitation({
      acceptedAt: EARLIER,
      acceptedBy: user as unknown as Invitation['acceptedBy'],
    });
    const { service, grantRole, events } = setup({
      users: [user],
      invitations: [invitation],
    });

    const error = await rejection(service.accept(TOKEN, { id: user.id }));

    expect(isAppError(error)).toBe(true);
    expect(error).toBeInstanceOf(AlreadyMentorError);
    expect(error).toMatchObject({
      status: 409,
      code: 'ALREADY_MENTOR',
      message: ALREADY_MENTOR_MESSAGE,
    });
    expect(grantRole).not.toHaveBeenCalled();
    expect(user.sessionVersion).toBe(4);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a used link of an account that no longer holds mentor is just invalid (404)', async () => {
    const user = makeUser({ roles: ['mentee'] });
    const invitation = makeInvitation({
      acceptedAt: EARLIER,
      acceptedBy: user as unknown as Invitation['acceptedBy'],
    });
    const { service } = setup({ users: [user], invitations: [invitation] });

    await expect(service.accept(TOKEN, { id: user.id })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('two accepts in a row (two tabs): the second is ALREADY_MENTOR and the grant happens once', async () => {
    const user = makeUser();
    const { service, grantRole, profiles } = setup({
      users: [user],
      invitations: [makeInvitation()],
    });

    await service.accept(TOKEN, { id: user.id });
    await expect(service.accept(TOKEN, { id: user.id })).rejects.toMatchObject({
      code: 'ALREADY_MENTOR',
    });

    expect(grantRole).toHaveBeenCalledTimes(1);
    expect(user.sessionVersion).toBe(4);
    expect(profiles).toHaveLength(1);
  });

  it('answers 404 for a malformed token before locking anything', async () => {
    const user = makeUser();
    const { service, em, grantRole } = setup({ users: [user], invitations: [makeInvitation()] });

    await expect(service.accept('../../etc', { id: user.id })).rejects.toMatchObject({
      status: 404,
      message: INVITATION_INVALID_MESSAGE,
    });
    expect(em.transactional).not.toHaveBeenCalled();
    expect(grantRole).not.toHaveBeenCalled();
  });

  it('answers 401 when the session user no longer exists', async () => {
    const { service, grantRole } = setup({ invitations: [makeInvitation()] });

    await expect(service.accept(TOKEN, { id: randomUUID() })).rejects.toMatchObject({ status: 401 });
    expect(grantRole).not.toHaveBeenCalled();
  });

  it('a second invitation keeps the first publish-by deadline on the profile', async () => {
    const user = makeUser({ roles: ['mentee', 'mentor'] });
    const profile = Object.assign(new MentorProfile(), {
      id: randomUUID(),
      user,
      initialPublishDueAt: EARLIER,
    });
    const invitation = makeInvitation();
    const { service, profiles, em } = setup({
      users: [user],
      invitations: [invitation],
      profiles: [profile],
    });

    const result = await service.accept(TOKEN, { id: user.id });

    expect(result).toMatchObject({
      changed: false,
      roles: ['mentee', 'mentor'],
      sessionVersion: 3,
    });
    expect(invitation.publishDueAt).toEqual(result.publishDueAt);
    expect(profiles).toEqual([profile]);
    expect(profile.initialPublishDueAt).toBe(EARLIER);
    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: user.id });
  });

  it('fills an empty initial deadline on an existing profile', async () => {
    const user = makeUser();
    const profile = Object.assign(new MentorProfile(), {
      id: randomUUID(),
      user,
      initialPublishDueAt: null,
    });
    const { service } = setup({
      users: [user],
      invitations: [makeInvitation()],
      profiles: [profile],
    });

    const { publishDueAt } = await service.accept(TOKEN, { id: user.id });

    expect(profile.initialPublishDueAt).toEqual(publishDueAt);
  });

  it('accept after a committed revoke: the locked re-read sees it, 404, nothing applied', async () => {
    const user = makeUser();
    const invitation = makeInvitation();
    const { service, profiles } = setup({
      users: [user],
      invitations: [invitation],
    });

    await service.revoke(invitation.id);
    await expect(service.accept(TOKEN, { id: user.id })).rejects.toMatchObject({
      status: 404,
    });

    expect(user.roles).toEqual(['mentee']);
    expect(invitation).toMatchObject({
      acceptedAt: null,
      acceptedBy: null,
      revokedAt: NOW,
    });
    expect(profiles).toHaveLength(0);
  });

  it('accept with the old token after a committed resend: 404; the new link still works', async () => {
    const user = makeUser();
    const invitation = makeInvitation();
    const { service } = setup({ users: [user], invitations: [invitation] });

    const { link } = await service.resend(invitation.id);
    await expect(service.accept(TOKEN, { id: user.id })).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.accept(tokenOf(link), { id: user.id })).resolves.toMatchObject({ changed: true });
  });
});

describe('InvitationService.revoke', () => {
  it('locks the row and revokes a pending invitation', async () => {
    const invitation = makeInvitation();
    const { service, em, logger } = setup({ invitations: [invitation] });

    const view = await service.revoke(invitation.id);

    expect(em.findOne).toHaveBeenCalledWith(Invitation, { id: invitation.id }, LOCK);
    expect(view).toMatchObject({
      id: invitation.id,
      status: 'revoked',
      revokedAt: NOW,
    });
    expect(invitation.revokedAt).toBe(NOW);
    expect(logger.info).toHaveBeenCalledWith({ invitationId: invitation.id }, 'Invitation revoked');
  });

  it('revokes an expired, unresolved invitation (it would block a new one)', async () => {
    const invitation = makeInvitation({ expiresAt: EARLIER });

    await expect(setup({ invitations: [invitation] }).service.revoke(invitation.id)).resolves.toMatchObject({
      status: 'revoked',
    });
  });

  it('revoke after a committed accept: 409, the acceptance stands', async () => {
    const user = makeUser();
    const invitation = makeInvitation();
    const { service } = setup({ users: [user], invitations: [invitation] });
    await service.accept(TOKEN, { id: user.id });

    await expect(service.revoke(invitation.id)).rejects.toMatchObject({
      status: 409,
      message: 'An accepted invitation cannot be revoked.',
    });
    expect(invitation).toMatchObject({ acceptedBy: user, revokedAt: null });
  });

  it('refuses an already revoked invitation', async () => {
    const invitation = makeInvitation({ revokedAt: EARLIER });

    await expect(setup({ invitations: [invitation] }).service.revoke(invitation.id)).rejects.toMatchObject({
      status: 409,
      message: 'A revoked invitation cannot be revoked.',
    });
  });

  it('answers 404 for an unknown id, and for a non-uuid id without querying', async () => {
    const { service, em } = setup();

    await expect(service.revoke(randomUUID())).rejects.toMatchObject({
      status: 404,
      message: 'Invitation not found.',
    });
    expect(em.findOne).toHaveBeenCalledTimes(1);
    await expect(service.revoke('not-a-uuid')).rejects.toMatchObject({
      status: 404,
    });
    expect(em.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('InvitationService.resend', () => {
  it('rotates the token and the expiry under the row lock and returns the new link', async () => {
    const invitation = makeInvitation({ expiresAt: EARLIER });
    const { service, em, logger } = setup({
      invitations: [invitation],
      env: { INVITATION_TTL_DAYS: '5' },
    });

    const { invitation: view, link } = await service.resend(invitation.id);

    expect(em.findOne).toHaveBeenCalledWith(Invitation, { id: invitation.id }, LOCK);
    expect(invitation.tokenHash).toBe(hashToken(tokenOf(link)));
    expect(tokenOf(link)).not.toBe(TOKEN);
    expect(view).toMatchObject({
      status: 'pending',
      expiresAt: new Date(NOW.getTime() + 5 * DAY_MS),
    });
    await expect(service.lookup(TOKEN)).rejects.toMatchObject({ status: 404 });
    await expect(service.lookup(tokenOf(link))).resolves.toMatchObject({
      email: EMAIL,
    });
    expect(logger.info).toHaveBeenCalledWith({ invitationId: invitation.id }, 'Invitation resent');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(tokenOf(link));
  });

  it('resend after a committed accept: 409, token unchanged', async () => {
    const user = makeUser();
    const invitation = makeInvitation();
    const { service } = setup({ users: [user], invitations: [invitation] });
    await service.accept(TOKEN, { id: user.id });

    await expect(service.resend(invitation.id)).rejects.toMatchObject({
      status: 409,
      message: 'An accepted invitation cannot be resent.',
    });
    expect(invitation.tokenHash).toBe(hashToken(TOKEN));
  });

  it('refuses a revoked invitation', async () => {
    const invitation = makeInvitation({ revokedAt: EARLIER });

    await expect(setup({ invitations: [invitation] }).service.resend(invitation.id)).rejects.toMatchObject({
      status: 409,
      message: 'A revoked invitation cannot be resent.',
    });
  });

  it('answers 503 without APP_URL before changing anything', async () => {
    const invitation = makeInvitation();
    const { service, em } = setup({ invitations: [invitation], appUrl: null });

    await expect(service.resend(invitation.id)).rejects.toMatchObject({
      status: 503,
    });
    expect(em.transactional).not.toHaveBeenCalled();
    expect(invitation.tokenHash).toBe(hashToken(TOKEN));
  });
});

describe('InvitationService.list', () => {
  it('lists every invitation with its status, oldest first, never a token', async () => {
    const acceptedBy = makeUser() as unknown as Invitation['acceptedBy'];
    const rows = [
      makeInvitation({ email: 'p@devmentor.test', token: 'a' }),
      makeInvitation({
        email: 'e@devmentor.test',
        token: 'b',
        expiresAt: EARLIER,
        batch: undefined,
      }),
      makeInvitation({
        email: 'r@devmentor.test',
        token: 'c',
        revokedAt: EARLIER,
      }),
      makeInvitation({
        email: 'a@devmentor.test',
        token: 'd',
        acceptedAt: EARLIER,
        acceptedBy,
        publishDueAt: NOW,
      }),
    ];
    const { service, em } = setup({ invitations: rows });

    const views = await service.list();

    expect(em.find).toHaveBeenCalledWith(Invitation, {}, { orderBy: { createdAt: 'asc' } });
    expect(views.map(({ email, status }) => [email, status])).toEqual([
      ['p@devmentor.test', 'pending'],
      ['e@devmentor.test', 'expired'],
      ['r@devmentor.test', 'revoked'],
      ['a@devmentor.test', 'accepted'],
    ]);
    expect(views[1].batch).toBeNull();
    expect(views[3]).toMatchObject({
      acceptedAt: EARLIER,
      publishDueAt: NOW,
      revokedAt: null,
    });
    expect(JSON.stringify(views)).not.toMatch(/tokenHash|token_hash/);
  });

  it('maps missing optional dates to null', async () => {
    const row = makeInvitation({
      acceptedAt: undefined,
      publishDueAt: undefined,
      revokedAt: undefined,
    });

    const [view] = await setup({ invitations: [row] }).service.list();

    expect(view).toMatchObject({
      acceptedAt: null,
      publishDueAt: null,
      revokedAt: null,
    });
  });

  it('filters by batch', async () => {
    const { service, em } = setup({
      invitations: [makeInvitation({ token: 'a' }), makeInvitation({ token: 'b', batch: '2026-12-b' })],
    });

    const views = await service.list({ batch: '2026-12-b' });

    expect(em.find).toHaveBeenCalledWith(Invitation, { batch: '2026-12-b' }, { orderBy: { createdAt: 'asc' } });
    expect(views.map((view) => view.batch)).toEqual(['2026-12-b']);
  });
});

describe('InvitationService.list D13 snapshot', () => {
  const LATER = new Date(NOW.getTime() + DAY_MS);

  function acceptedWithProfile(token: string, dueAt: Date | null) {
    const user = makeUser({ email: `${token}@devmentor.test` });
    const invitation = makeInvitation({
      token,
      acceptedAt: EARLIER,
      acceptedBy: user as unknown as Invitation['acceptedBy'],
      publishDueAt: dueAt,
    });
    const profile = Object.assign(new MentorProfile(), { id: `profile-${token}`, user, initialPublishDueAt: dueAt });

    return { invitation, profile };
  }

  it('is met when the mentor has bookable slots at clock.now()', async () => {
    const { invitation, profile } = acceptedWithProfile('met', LATER);
    const { service, slotService } = setup({ invitations: [invitation], profiles: [profile] });
    slotService.countBookable.mockResolvedValue(2);

    const [view] = await service.list();

    expect(slotService.countBookable).toHaveBeenCalledWith(profile.id, NOW);
    expect(view).toMatchObject({ bookableSlots: 2, d13: 'met' });
  });

  it('is pending with no slots before the profile due date', async () => {
    const { invitation, profile } = acceptedWithProfile('pending', LATER);

    const [view] = await setup({ invitations: [invitation], profiles: [profile] }).service.list();

    expect(view).toMatchObject({ bookableSlots: 0, d13: 'pending' });
  });

  it('is missed with no slots at or after the due date', async () => {
    const { invitation, profile } = acceptedWithProfile('missed', NOW);

    const [view] = await setup({ invitations: [invitation], profiles: [profile] }).service.list();

    expect(view).toMatchObject({ bookableSlots: 0, d13: 'missed' });
  });

  it('is missed when no due date is known at all', async () => {
    const { invitation, profile } = acceptedWithProfile('nodue', null);

    const [view] = await setup({ invitations: [invitation], profiles: [profile] }).service.list();

    expect(view).toMatchObject({ bookableSlots: 0, d13: 'missed' });
  });

  it('counts 0 without a profile and judges by the invitation due date', async () => {
    const user = makeUser();
    const accepted = (token: string, publishDueAt: Date) =>
      makeInvitation({
        token,
        acceptedAt: EARLIER,
        acceptedBy: user as unknown as Invitation['acceptedBy'],
        publishDueAt,
      });
    const { service, slotService } = setup({ invitations: [accepted('a', LATER), accepted('b', EARLIER)] });

    const views = await service.list();

    expect(slotService.countBookable).not.toHaveBeenCalled();
    expect(views.map(({ bookableSlots, d13 }) => [bookableSlots, d13])).toEqual([
      [0, 'pending'],
      [0, 'missed'],
    ]);
  });

  it('counts 0 for an accepted invitation without an accepting user', async () => {
    const row = makeInvitation({ acceptedAt: EARLIER, acceptedBy: null, publishDueAt: LATER });

    const [view] = await setup({ invitations: [row] }).service.list();

    expect(view).toMatchObject({ bookableSlots: 0, d13: 'pending' });
  });

  it('leaves non-accepted invitations with nulls', async () => {
    const { service, slotService } = setup({ invitations: [makeInvitation()] });

    const [view] = await service.list();

    expect(view).toMatchObject({ bookableSlots: null, d13: null });
    expect(slotService.countBookable).not.toHaveBeenCalled();
  });
});
