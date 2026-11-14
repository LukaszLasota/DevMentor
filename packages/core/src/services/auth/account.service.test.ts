import {
  EMAIL_VERIFICATION_TTL_MS,
  EmailVerificationToken,
  LockMode,
  UniqueConstraintViolationException,
  User,
  type Role,
} from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { isAppError, ServiceUnavailableError, TooManyRequestsError } from '../../http/errors';
import type { MailMessage } from '../../mail/mail-sender';
import { hashPassword, PasswordHasher, verifyPassword } from '../../security/password';
import {
  REGISTER_RATE_LIMITS,
  RESEND_RATE_LIMITS,
  SIGN_IN_RATE_LIMITS,
  rateLimitChecks,
  type RateLimitCheck,
} from '../../security/rate-limit';
import { hashToken } from '../../security/token';
import {
  AccountService,
  effectiveRoles,
  GithubAccountConflictError,
  INVALID_CREDENTIALS_MESSAGE,
  normalizeEmail,
  normalizeRoles,
  VerificationLinkInvalidError,
} from './account.service';
import type { GithubProfile } from './github-oauth.service';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const EARLIER = new Date('2026-10-01T08:00:00.000Z');
const OPERATOR = 'founder@devmentor.test';

const PROFILE: GithubProfile = {
  githubId: 4242,
  login: 'octo-cat',
  avatarUrl: 'https://avatars.example.test/u/4242',
  email: 'octo@devmentor.test',
};

let nextId = 0;

function makeUser(overrides: Partial<User> = {}): User {
  nextId += 1;

  return Object.assign(new User(), {
    id: `user-${nextId}`,
    email: 'someone@devmentor.test',
    roles: ['mentee'],
    sessionVersion: 0,
    githubId: null,
    githubLogin: null,
    avatarUrl: null,
    emailVerifiedAt: null,
    ...overrides,
  });
}

type Row = Record<string, unknown>;

/** Equal fields; `{ $gt: date }`; a string compared with a reference's `id` (`{ user: userId }`). */
function matches(row: object, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as Row)[key];

    if (expected !== null && typeof expected === 'object' && '$gt' in expected) {
      return actual instanceof Date && actual > (expected as { $gt: Date }).$gt;
    }

    if (typeof expected === 'string' && actual !== null && typeof actual === 'object' && 'id' in actual) {
      return actual.id === expected;
    }

    return actual === expected;
  });
}

/**
 * In-memory stand-in for the scoped `EntityManager` over `users` and `email_verification_tokens`:
 * `findOne` matches (see `matches`), `create` adds a row (like `persistOnCreate`), `nativeUpdate`
 * changes the matching rows and returns the count, `transactional` runs the callback on the same
 * fake and flushes, `flush` resolves unless a test makes it fail.
 */
function fakeEm(users: User[], tokens: EmailVerificationToken[]) {
  const table = (entity: unknown): object[] => (entity === EmailVerificationToken ? tokens : users);
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Record<string, unknown>) => table(entity).find((row) => matches(row, where)) ?? null),
    findOneOrFail: vi.fn(async (entity: unknown, where: Record<string, unknown>) => {
      const row = table(entity).find((candidate) => matches(candidate, where));
      if (row === undefined) throw new Error('not found');
      return row;
    }),
    create: vi.fn((entity: unknown, data: Row) => {
      if (entity === EmailVerificationToken) {
        nextId += 1;
        const token = Object.assign(new EmailVerificationToken(), { id: `token-${nextId}`, usedAt: null, ...data });
        tokens.push(token);
        return token;
      }

      const user = makeUser(data as Partial<User>);
      users.push(user);
      return user;
    }),
    // Conditional UPDATE: changes the rows matching every `where` field, returns the affected count.
    nativeUpdate: vi.fn(async (entity: unknown, where: Record<string, unknown>, data: Row) => {
      const hits = table(entity).filter((row) => matches(row, where));
      hits.forEach((row) => Object.assign(row, data));
      return hits.length;
    }),
    // Rows are the managed entities themselves, so a refresh has nothing to reload.
    refreshOrFail: vi.fn(async (user: User) => user),
    flush: vi.fn(async () => undefined),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      const result = await callback(em);
      await em.flush();
      return result;
    }),
  };

  return em;
}

/** Fast scrypt cost for unit tests. */
const TEST_SCRYPT = { logN: 4, r: 8, p: 1 };
const APP_URL = 'https://app.devmentor.test';

interface SetupOptions {
  operatorEmails?: string;
  appUrl?: string | null;
  tokens?: EmailVerificationToken[];
  passwordHasher?: PasswordHasher;
}

function setup(rows: User[] = [], operatorEmails = OPERATOR, options: SetupOptions = {}) {
  const tokens = options.tokens ?? [];
  const em = fakeEm(rows, tokens);
  const events = { emit: vi.fn(async () => undefined) };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const mailSender = { send: vi.fn<(message: MailMessage) => Promise<void>>(async () => undefined) };
  const rateLimiter = { consumeAll: vi.fn<(checks: readonly RateLimitCheck[]) => Promise<void>>(async () => undefined) };
  const passwordHasher = options.passwordHasher ?? new PasswordHasher({ concurrency: 1, waitMs: 20, params: TEST_SCRYPT });
  const appUrl = options.appUrl === undefined ? APP_URL : options.appUrl;
  const service = new AccountService({
    em: em as unknown as Cradle['em'],
    env: parseEnv({
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      OPERATOR_EMAILS: operatorEmails,
      ...(appUrl === null ? {} : { APP_URL: appUrl }),
    }),
    clock: { now: () => NOW },
    events: events as unknown as Cradle['events'],
    logger: logger as unknown as Cradle['logger'],
    mailSender,
    passwordHasher,
    rateLimiter: rateLimiter as unknown as Cradle['rateLimiter'],
  });

  return { service, em, events, logger, rows, tokens, mailSender, rateLimiter, passwordHasher };
}

function uniqueViolation(): UniqueConstraintViolationException {
  return new UniqueConstraintViolationException(new Error('duplicate key value violates unique constraint'));
}

describe('normalizeEmail', () => {
  it('trims and lower-cases only (no alias or dot stripping)', () => {
    expect(normalizeEmail('  A.B+x@Example.TEST ')).toBe('a.b+x@example.test');
  });
});

describe('normalizeRoles', () => {
  it('removes duplicates and sorts into the stable ROLES order', () => {
    expect(normalizeRoles(['operator', 'mentee', 'operator', 'mentor', 'mentee'])).toEqual(['mentee', 'mentor', 'operator']);
  });

  it('never returns an empty set', () => {
    expect(normalizeRoles([])).toEqual(['mentee']);
  });
});

describe('effectiveRoles', () => {
  it('adds operator for a verified email on the allowlist, keeping other roles', () => {
    expect(effectiveRoles(['mentor', 'mentee'], OPERATOR, true, [OPERATOR])).toEqual(['mentee', 'mentor', 'operator']);
  });

  it('matches the allowlist case-insensitively', () => {
    expect(effectiveRoles(['mentee'], 'Founder@DevMentor.test', true, [OPERATOR])).toEqual(['mentee', 'operator']);
  });

  it('removes operator when the email is not on the allowlist', () => {
    expect(effectiveRoles(['mentee', 'operator', 'mentor'], 'x@devmentor.test', true, [OPERATOR])).toEqual(['mentee', 'mentor']);
  });

  it('never grants operator to an unverified email', () => {
    expect(effectiveRoles(['mentee', 'operator'], OPERATOR, false, [OPERATOR])).toEqual(['mentee']);
  });

  it('falls back to mentee when operator was the only stored role and is removed', () => {
    expect(effectiveRoles(['operator'], 'x@devmentor.test', true, [])).toEqual(['mentee']);
  });

  it('normalizes duplicates', () => {
    expect(effectiveRoles(['operator', 'operator', 'mentee', 'mentee'], OPERATOR, true, [OPERATOR])).toEqual([
      'mentee',
      'operator',
    ]);
  });
});

describe('AccountService.resolveGithubAccount', () => {
  it('rule 1: signs in by github_id, refreshes login and avatar, never rewrites the email', async () => {
    const existing = makeUser({
      email: 'old-primary@devmentor.test',
      githubId: PROFILE.githubId,
      githubLogin: 'old-login',
      avatarUrl: null,
      emailVerifiedAt: EARLIER,
    });
    const { service, em, events } = setup([existing]);

    const user = await service.resolveGithubAccount({ ...PROFILE, email: 'new-primary@devmentor.test' });

    expect(user).toBe(existing);
    expect(user).toMatchObject({
      email: 'old-primary@devmentor.test',
      githubLogin: PROFILE.login,
      avatarUrl: PROFILE.avatarUrl,
      emailVerifiedAt: EARLIER,
      roles: ['mentee'],
    });
    expect(em.findOne).toHaveBeenCalledTimes(1);
    expect(em.create).not.toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rule 2: links a verified-email password account, keeping its verification date and password', async () => {
    const existing = makeUser({ email: PROFILE.email, emailVerifiedAt: EARLIER, passwordHash: 'scrypt$hash' });
    const { service, em, logger } = setup([existing]);

    const user = await service.resolveGithubAccount(PROFILE);

    expect(user).toBe(existing);
    expect(user).toMatchObject({
      githubId: PROFILE.githubId,
      githubLogin: PROFILE.login,
      avatarUrl: PROFILE.avatarUrl,
      emailVerifiedAt: EARLIER,
      passwordHash: 'scrypt$hash',
    });
    expect(em.create).not.toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ userId: existing.id }, 'GitHub account linked by verified email');
  });

  it('rule 2: links with one conditional update, only while github_id is still null', async () => {
    const existing = makeUser({ email: PROFILE.email, emailVerifiedAt: EARLIER });
    const { service, em } = setup([existing]);

    await service.resolveGithubAccount(PROFILE);

    expect(em.nativeUpdate).toHaveBeenCalledWith(
      User,
      { id: existing.id, githubId: null },
      { githubId: PROFILE.githubId, githubLogin: PROFILE.login, avatarUrl: PROFILE.avatarUrl, emailVerifiedAt: EARLIER },
    );
    expect(em.refreshOrFail).toHaveBeenCalledWith(existing);
  });

  it('concurrent link: another GitHub account linked the email after our read → conflict, nothing changed (rule 3)', async () => {
    const existing = makeUser({ email: PROFILE.email, emailVerifiedAt: EARLIER });
    const { service, em, logger, events } = setup([existing]);
    em.nativeUpdate.mockImplementationOnce(async () => {
      // A parallel callback for GitHub id 999 with the same verified email won the update.
      Object.assign(existing, { githubId: 999, githubLogin: 'someone-else' });
      return 0;
    });

    await expect(service.resolveGithubAccount(PROFILE)).rejects.toBeInstanceOf(GithubAccountConflictError);
    expect(existing).toMatchObject({ githubId: 999, githubLogin: 'someone-else' });
    expect(em.flush).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith({ userId: existing.id }, 'GitHub account linked by verified email');
  });

  it('concurrent link: the same GitHub account linked the email after our read → signs in (rule 1)', async () => {
    const existing = makeUser({ email: PROFILE.email, emailVerifiedAt: EARLIER });
    const { service, em, logger } = setup([existing]);
    em.nativeUpdate.mockImplementationOnce(async () => {
      Object.assign(existing, { githubId: PROFILE.githubId, githubLogin: 'old-login' });
      return 0;
    });

    const user = await service.resolveGithubAccount(PROFILE);

    expect(user).toBe(existing);
    expect(user).toMatchObject({ githubId: PROFILE.githubId, githubLogin: PROFILE.login, avatarUrl: PROFILE.avatarUrl });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rule 2: completes a pending registration (no password, unverified) and marks the email verified', async () => {
    const pending = makeUser({ email: PROFILE.email, emailVerifiedAt: null, passwordHash: null });
    const { service } = setup([pending]);

    const user = await service.resolveGithubAccount({ ...PROFILE, email: 'Octo@DevMentor.test' });

    expect(user).toBe(pending);
    expect(user).toMatchObject({ githubId: PROFILE.githubId, emailVerifiedAt: NOW, email: PROFILE.email });
  });

  it('concurrent first sign-in: the winner commits between the github_id and email lookups → signs in, no conflict', async () => {
    const winner = makeUser({ email: PROFILE.email, githubId: PROFILE.githubId, githubLogin: 'old-login', emailVerifiedAt: EARLIER });
    const { service, em, logger } = setup([winner]);
    // The github_id lookup ran before the winner's row was committed.
    em.findOne.mockResolvedValueOnce(null);

    const user = await service.resolveGithubAccount(PROFILE);

    expect(user).toBe(winner);
    expect(user).toMatchObject({ githubLogin: PROFILE.login, avatarUrl: PROFILE.avatarUrl, emailVerifiedAt: EARLIER });
    expect(em.findOne).toHaveBeenCalledTimes(2);
    expect(em.create).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rule 3: refuses an email linked to a different github_id and changes nothing', async () => {
    const other = makeUser({ email: PROFILE.email, githubId: 999, githubLogin: 'someone-else', emailVerifiedAt: EARLIER });
    const snapshot = { ...other };
    const { service, em, events } = setup([other]);

    const result = service.resolveGithubAccount(PROFILE);

    await expect(result).rejects.toBeInstanceOf(GithubAccountConflictError);
    await expect(result).rejects.toMatchObject({ status: 409, code: 'GITHUB_ACCOUNT_CONFLICT' });
    expect({ ...other }).toEqual(snapshot);
    expect(em.flush).not.toHaveBeenCalled();
    expect(em.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rule 4: creates a verified mentee with the lower-cased email', async () => {
    const { service, em, rows, events } = setup();

    const user = await service.resolveGithubAccount({ ...PROFILE, email: ' Octo@DevMentor.TEST ' });

    expect(rows).toEqual([user]);
    expect(em.create).toHaveBeenCalledWith(User, {
      email: PROFILE.email,
      roles: ['mentee'],
      githubId: PROFILE.githubId,
      githubLogin: PROFILE.login,
      avatarUrl: PROFILE.avatarUrl,
      emailVerifiedAt: NOW,
    });
    expect(em.flush).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('rule 4: creates an allowlisted email with the operator role already reconciled', async () => {
    const { service } = setup();

    const user = await service.resolveGithubAccount({ ...PROFILE, email: OPERATOR });

    expect(user.roles).toEqual(['mentee', 'operator']);
  });

  it('reconciles operator on sign-in and emits roles_changed after the flush (allowlist added)', async () => {
    const existing = makeUser({ email: OPERATOR, githubId: PROFILE.githubId, roles: ['mentee', 'mentor'], emailVerifiedAt: EARLIER });
    const { service, em, events } = setup([existing]);
    const order: string[] = [];
    em.flush.mockImplementation(async () => {
      order.push('flush');
    });
    events.emit.mockImplementation(async () => {
      order.push('emit');
    });

    const user = await service.resolveGithubAccount(PROFILE);

    expect(user.roles).toEqual(['mentee', 'mentor', 'operator']);
    expect(user.sessionVersion).toBe(0);
    expect(order).toEqual(['flush', 'emit']);
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', {
      userId: existing.id,
      roles: ['mentee', 'mentor', 'operator'],
    });
  });

  it('concurrent create: a unique violation on insert re-reads and signs in to the winner', async () => {
    const { service, em, rows } = setup();
    const winner = makeUser({ email: PROFILE.email, githubId: PROFILE.githubId, emailVerifiedAt: NOW });
    em.flush.mockImplementationOnce(async () => {
      // Another request inserted the same GitHub user first; our insert loses.
      rows.length = 0;
      rows.push(winner);
      throw uniqueViolation();
    });

    const user = await service.resolveGithubAccount(PROFILE);

    expect(user).toBe(winner);
    expect(em.clear).toHaveBeenCalledTimes(1);
    expect(em.create).toHaveBeenCalledTimes(1);
  });

  it('concurrent create: a second unique violation propagates (no retry loop)', async () => {
    const { service, em } = setup();
    em.flush.mockRejectedValue(uniqueViolation());

    await expect(service.resolveGithubAccount(PROFILE)).rejects.toBeInstanceOf(UniqueConstraintViolationException);
    expect(em.clear).toHaveBeenCalledTimes(1);
    expect(em.flush).toHaveBeenCalledTimes(2);
  });

  it('propagates other errors without re-reading', async () => {
    const { service, em } = setup();
    em.flush.mockRejectedValue(new Error('connection lost'));

    await expect(service.resolveGithubAccount(PROFILE)).rejects.toThrow('connection lost');
    expect(em.clear).not.toHaveBeenCalled();
  });
});

describe('AccountService.reconcileOperator', () => {
  it('adds operator when the verified email joins the allowlist, keeping other roles', async () => {
    const user = makeUser({ email: OPERATOR, roles: ['mentee', 'mentor'], emailVerifiedAt: EARLIER });
    const { service, em, events } = setup([user]);

    await expect(service.reconcileOperator(user)).resolves.toBe(user);

    expect(user.roles).toEqual(['mentee', 'mentor', 'operator']);
    expect(em.flush).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', { userId: user.id, roles: user.roles });
  });

  it('removes operator when the email leaves the allowlist, without bumping session_version', async () => {
    const user = makeUser({ email: OPERATOR, roles: ['mentee', 'operator'], emailVerifiedAt: EARLIER, sessionVersion: 3 });
    const { service, events } = setup([user], '');

    await service.reconcileOperator(user);

    expect(user.roles).toEqual(['mentee']);
    expect(user.sessionVersion).toBe(3);
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', { userId: user.id, roles: ['mentee'] });
  });

  it('normalizes duplicate stored roles', async () => {
    const user = makeUser({ roles: ['mentee', 'mentor', 'mentee'] as Role[], emailVerifiedAt: EARLIER });
    const { service, em } = setup([user]);

    await service.reconcileOperator(user);

    expect(user.roles).toEqual(['mentee', 'mentor']);
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: no write and no event when the stored set already agrees', async () => {
    const user = makeUser({ email: OPERATOR, roles: ['mentee', 'operator'], emailVerifiedAt: EARLIER });
    const { service, em, events } = setup([user]);

    await service.reconcileOperator(user);
    await service.reconcileOperator(user);

    expect(user.roles).toEqual(['mentee', 'operator']);
    expect(em.flush).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not grant operator to an allowlisted but unverified email', async () => {
    const user = makeUser({ email: OPERATOR, roles: ['mentee'], emailVerifiedAt: null });
    const { service, em } = setup([user]);

    await service.reconcileOperator(user);

    expect(user.roles).toEqual(['mentee']);
    expect(em.flush).not.toHaveBeenCalled();
  });
});

describe('AccountService.signOut', () => {
  it('bumps session_version', async () => {
    const user = makeUser({ sessionVersion: 2 });
    const { service, em } = setup([user]);

    await service.signOut(user.id);

    expect(user.sessionVersion).toBe(3);
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an unknown user', async () => {
    const { service, em } = setup();

    await expect(service.signOut('missing')).resolves.toBeUndefined();
    expect(em.flush).not.toHaveBeenCalled();
  });
});

const PASSWORD = 'correct horse battery';
const IP = '203.0.113.7';

/** The raw token and the fragment parameters of the link in a sent mail. */
function linkIn(message: MailMessage): { url: URL; token: string; returnTo: string | null } {
  const match = /https:\/\/\S+/.exec(message.text);
  expect(match).not.toBeNull();
  const url = new URL(match![0]);
  const fragment = new URLSearchParams(url.hash.slice(1));

  return { url, token: fragment.get('token') ?? '', returnTo: fragment.get('returnTo') };
}

function makeToken(user: User, overrides: Partial<EmailVerificationToken> & { raw?: string } = {}): EmailVerificationToken {
  const { raw = 'raw-token', ...rest } = overrides;
  nextId += 1;

  return Object.assign(new EmailVerificationToken(), {
    id: `token-${nextId}`,
    user,
    tokenHash: hashToken(raw),
    expiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_TTL_MS),
    usedAt: null,
    ...rest,
  });
}

function pendingUser(overrides: Partial<User> = {}): User {
  return makeUser({ email: 'new@devmentor.test', passwordHash: null, emailVerifiedAt: null, ...overrides });
}

describe('AccountService.startRegistration', () => {
  it('new email: consumes the register limits, creates an unverified mentee without a password and mails a link', async () => {
    const { service, rows, tokens, em, rateLimiter, mailSender, logger } = setup();

    await service.startRegistration({ email: ' New@DevMentor.TEST ' }, { ip: IP });

    expect(rateLimiter.consumeAll).toHaveBeenCalledWith(
      rateLimitChecks(REGISTER_RATE_LIMITS, { email: 'new@devmentor.test', ip: IP }),
    );
    expect(rows).toHaveLength(1);
    const [user] = rows;
    expect(user).toMatchObject({ email: 'new@devmentor.test', roles: ['mentee'], emailVerifiedAt: null });
    expect(user.passwordHash).toBeUndefined();
    expect(em.flush).toHaveBeenCalledTimes(1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ user, usedAt: null, expiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_TTL_MS) });

    expect(mailSender.send).toHaveBeenCalledTimes(1);
    const [message] = mailSender.send.mock.calls[0];
    expect(message).toMatchObject({ to: 'new@devmentor.test', subject: 'Finish your DevMentor registration' });
    const link = linkIn(message);
    expect(`${link.url.origin}${link.url.pathname}`).toBe(`${APP_URL}/verify-email`);
    expect(link.url.search).toBe('');
    expect(link.returnTo).toBeNull();
    // Only the hash is stored; the raw token exists only in the mail.
    expect(tokens[0].tokenHash).toBe(hashToken(link.token));
    expect(tokens[0].tokenHash).not.toBe(link.token);
    expect(logger.info).toHaveBeenCalledWith({ userId: user.id }, 'Registration started');
  });

  it('never grants operator at registration (the email is not verified yet)', async () => {
    const { service, rows } = setup();

    await service.startRegistration({ email: OPERATOR }, { ip: null });

    expect(rows[0].roles).toEqual(['mentee']);
  });

  it('carries a safe returnTo inside the link fragment (L02)', async () => {
    const { service, mailSender } = setup();

    await service.startRegistration({ email: 'new@devmentor.test', returnTo: '/invitations/abc?from=mail' }, { ip: null });

    const link = linkIn(mailSender.send.mock.calls[0][0]);
    expect(link.returnTo).toBe('/invitations/abc?from=mail');
    expect(link.url.search).toBe('');
  });

  it.each(['//evil.test/x', 'https://evil.test', '/sign-in', '/api/auth/me'])('drops an unsafe returnTo %s from the link', async (returnTo) => {
    const { service, mailSender } = setup();

    await service.startRegistration({ email: 'new@devmentor.test', returnTo }, { ip: null });

    expect(linkIn(mailSender.send.mock.calls[0][0]).returnTo).toBeNull();
  });

  it.each([
    ['a GitHub-only account', { githubId: 77, emailVerifiedAt: EARLIER }],
    ['a verified account with a password', { passwordHash: '$scrypt$x', emailVerifiedAt: EARLIER }],
    ['a pending registration', { passwordHash: null, emailVerifiedAt: null }],
  ])('existing email (%s): sends "someone tried to register" and changes nothing', async (_kind, fields) => {
    const existing = makeUser({ email: 'taken@devmentor.test', ...fields });
    const snapshot = { ...existing };
    const { service, rows, tokens, em, mailSender } = setup([existing]);

    await expect(service.startRegistration({ email: 'Taken@devmentor.test' }, { ip: IP })).resolves.toBeUndefined();

    expect(rows).toEqual([existing]);
    expect({ ...existing }).toEqual(snapshot);
    expect(tokens).toEqual([]);
    expect(em.create).not.toHaveBeenCalled();
    expect(em.flush).not.toHaveBeenCalled();
    expect(mailSender.send).toHaveBeenCalledTimes(1);
    const [message] = mailSender.send.mock.calls[0];
    expect(message).toMatchObject({ to: 'taken@devmentor.test', subject: 'Someone tried to register with your email' });
    expect(message.text).toContain(`${APP_URL}/sign-in`);
    expect(message.text).toContain(`${APP_URL}/register`);
    expect(message.text).not.toContain('#token=');
  });

  it('a second registration of the same email creates nothing more and mails the owner instead', async () => {
    const { service, rows, tokens, mailSender } = setup();

    await service.startRegistration({ email: 'new@devmentor.test' }, { ip: null });
    await service.startRegistration({ email: 'new@devmentor.test' }, { ip: null });

    expect(rows).toHaveLength(1);
    expect(tokens).toHaveLength(1);
    expect(mailSender.send.mock.calls.map(([message]) => message.subject)).toEqual([
      'Finish your DevMentor registration',
      'Someone tried to register with your email',
    ]);
  });

  it('a parallel registration of the same email that commits first → the owner mail, no link', async () => {
    const { service, em, mailSender } = setup();
    em.flush.mockRejectedValueOnce(uniqueViolation());

    await service.startRegistration({ email: 'new@devmentor.test' }, { ip: null });

    expect(em.clear).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send.mock.calls[0][0].subject).toBe('Someone tried to register with your email');
  });

  it('propagates other write errors without sending mail', async () => {
    const { service, em, mailSender } = setup();
    em.flush.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.startRegistration({ email: 'new@devmentor.test' }, { ip: null })).rejects.toThrow('connection lost');
    expect(em.clear).not.toHaveBeenCalled();
    expect(mailSender.send).not.toHaveBeenCalled();
  });

  it('mail failure: the 503 propagates and the committed pending account stays (resend completes it)', async () => {
    const { service, rows, tokens, mailSender } = setup();
    mailSender.send.mockRejectedValueOnce(new ServiceUnavailableError('Mail delivery is unavailable.'));

    const error = await service.startRegistration({ email: 'new@devmentor.test' }, { ip: null }).catch((caught: unknown) => caught);

    expect(isAppError(error) && error.status).toBe(503);
    expect(rows).toHaveLength(1);
    expect(tokens).toHaveLength(1);
  });

  it('rate limited: the 429 propagates before any lookup, write or mail', async () => {
    const { service, em, rateLimiter, mailSender } = setup();
    rateLimiter.consumeAll.mockRejectedValueOnce(new TooManyRequestsError(120));

    await expect(service.startRegistration({ email: 'new@devmentor.test' }, { ip: IP })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 120,
    });
    expect(em.findOne).not.toHaveBeenCalled();
    expect(em.create).not.toHaveBeenCalled();
    expect(mailSender.send).not.toHaveBeenCalled();
  });

  it('without APP_URL: 503, nothing written or sent', async () => {
    const { service, em, mailSender, logger } = setup([], OPERATOR, { appUrl: null });

    await expect(service.startRegistration({ email: 'new@devmentor.test' }, { ip: null })).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(em.create).not.toHaveBeenCalled();
    expect(mailSender.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APP_URL'));
  });
});

describe('AccountService.resendVerification', () => {
  it('pending account: consumes the resend limit, retires older unused links and mails a new one', async () => {
    const user = pendingUser();
    const older = makeToken(user, { raw: 'older' });
    const used = makeToken(user, { raw: 'used', usedAt: EARLIER, expiresAt: new Date(NOW.getTime() + 1000) });
    const other = makeToken(makeUser({ email: 'other@devmentor.test' }), { raw: 'other' });
    const { service, tokens, rateLimiter, mailSender, em } = setup([user], OPERATOR, { tokens: [older, used, other] });

    await service.resendVerification({ email: 'NEW@devmentor.test', returnTo: '/invitations/x' }, { ip: IP });

    expect(rateLimiter.consumeAll).toHaveBeenCalledWith(rateLimitChecks(RESEND_RATE_LIMITS, { email: 'new@devmentor.test', ip: IP }));
    expect(older.expiresAt).toEqual(NOW);
    expect(used.expiresAt).toEqual(new Date(NOW.getTime() + 1000));
    expect(other.expiresAt).toEqual(new Date(NOW.getTime() + EMAIL_VERIFICATION_TTL_MS));
    expect(tokens).toHaveLength(4);
    expect(em.flush).toHaveBeenCalledTimes(1);

    const [message] = mailSender.send.mock.calls[0];
    expect(message).toMatchObject({ to: 'new@devmentor.test', subject: 'Finish your DevMentor registration' });
    const link = linkIn(message);
    expect(tokens[3]).toMatchObject({ user, tokenHash: hashToken(link.token), usedAt: null });
    expect(link.returnTo).toBe('/invitations/x');
  });

  // Phase 2 review: the check, the retirement and the insert run in one transaction on the locked
  // user row, so parallel resends and a parallel set-password serialize (integration:
  // account-email-flows.test.ts).
  it('reads the user FOR UPDATE inside the transaction that retires and inserts', async () => {
    const user = pendingUser();
    const { service, em } = setup([user]);
    const order: string[] = [];
    em.transactional.mockImplementationOnce(async (callback) => {
      order.push('begin');
      const result = await callback(em);
      order.push('commit');
      return result;
    });
    em.findOne.mockImplementationOnce(async (_entity, where) => {
      order.push('lock user');
      return user.email === where.email ? user : null;
    });
    em.nativeUpdate.mockImplementationOnce(async () => {
      order.push('retire');
      return 0;
    });
    em.create.mockImplementationOnce((entity, data) => {
      order.push('insert');
      return Object.assign(new EmailVerificationToken(), { id: 'token-x', usedAt: null, ...data });
    });

    await service.resendVerification({ email: user.email }, { ip: null });

    expect(em.findOne).toHaveBeenCalledWith(User, { email: user.email }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
    expect(order).toEqual(['begin', 'lock user', 'retire', 'insert', 'commit']);
  });

  it('a password committed before the lock: nothing retired, inserted or sent', async () => {
    const user = pendingUser();
    const { service, em, mailSender } = setup([user]);
    em.findOne.mockImplementationOnce(async () => Object.assign(user, { passwordHash: '$scrypt$set-meanwhile' }));

    await service.resendVerification({ email: user.email }, { ip: null });

    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(em.create).not.toHaveBeenCalled();
    expect(mailSender.send).not.toHaveBeenCalled();
  });

  it('a retired link no longer sets the password; the new one does', async () => {
    const user = pendingUser();
    const { service, mailSender } = setup([user], OPERATOR, { tokens: [makeToken(user, { raw: 'older' })] });

    await service.resendVerification({ email: user.email }, { ip: null });

    await expect(service.setPasswordFromLink({ token: 'older', password: PASSWORD }, null)).rejects.toBeInstanceOf(
      VerificationLinkInvalidError,
    );
    const { token } = linkIn(mailSender.send.mock.calls[0][0]);
    await expect(service.setPasswordFromLink({ token, password: PASSWORD }, null)).resolves.toMatchObject({ user });
  });

  it('a GitHub-only account (no password yet) also gets a link, as the spec words it', async () => {
    const user = makeUser({ email: 'gh@devmentor.test', githubId: 9, emailVerifiedAt: EARLIER });
    const { service, mailSender } = setup([user]);

    await service.resendVerification({ email: user.email }, { ip: null });

    expect(mailSender.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unknown email', []],
    ['an account with a password', [makeUser({ email: 'new@devmentor.test', passwordHash: '$scrypt$x' })]],
  ])('%s: resolves the same way, nothing written or sent', async (_kind, users) => {
    const { service, em, mailSender } = setup(users as User[]);

    await expect(service.resendVerification({ email: 'new@devmentor.test' }, { ip: null })).resolves.toBeUndefined();
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(em.create).not.toHaveBeenCalled();
    expect(mailSender.send).not.toHaveBeenCalled();
  });

  it('mail failure: the 503 propagates', async () => {
    const { service, mailSender } = setup([pendingUser()]);
    mailSender.send.mockRejectedValueOnce(new ServiceUnavailableError());

    await expect(service.resendVerification({ email: 'new@devmentor.test' }, { ip: null })).rejects.toMatchObject({ status: 503 });
  });

  it('rate limited: the 429 propagates before any lookup', async () => {
    const { service, em, rateLimiter } = setup([pendingUser()]);
    rateLimiter.consumeAll.mockRejectedValueOnce(new TooManyRequestsError(60));

    await expect(service.resendVerification({ email: 'new@devmentor.test' }, { ip: null })).rejects.toMatchObject({ status: 429 });
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('without APP_URL: 503 before any lookup', async () => {
    const { service, em } = setup([pendingUser()], OPERATOR, { appUrl: null });

    await expect(service.resendVerification({ email: 'new@devmentor.test' }, { ip: null })).rejects.toMatchObject({ status: 503 });
    expect(em.findOne).not.toHaveBeenCalled();
  });
});

describe('AccountService.setPasswordFromLink', () => {
  it('sets the password, verifies the email, bumps session_version and consumes the token in one transaction', async () => {
    const user = pendingUser({ sessionVersion: 2 });
    const token = makeToken(user, { raw: 'link-1' });
    const { service, em, events, logger } = setup([user], OPERATOR, { tokens: [token] });

    const result = await service.setPasswordFromLink({ token: 'link-1', password: PASSWORD }, null);

    expect(result).toEqual({ user, redirectTo: '/mentors' });
    expect(user).toMatchObject({ emailVerifiedAt: NOW, sessionVersion: 3, roles: ['mentee'] });
    expect(await verifyPassword(PASSWORD, user.passwordHash!)).toBe(true);
    expect(token.usedAt).toEqual(NOW);
    expect(em.transactional).toHaveBeenCalledTimes(1);
    expect(em.nativeUpdate).toHaveBeenCalledWith(
      EmailVerificationToken,
      { tokenHash: hashToken('link-1'), usedAt: null, expiresAt: { $gt: NOW } },
      { usedAt: NOW },
    );
    expect(events.emit).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ userId: user.id }, 'Password set from verification link');
  });

  it('keeps an earlier verification date (e.g. GitHub linked the pending account meanwhile)', async () => {
    const user = pendingUser({ githubId: 5, emailVerifiedAt: EARLIER });
    const { service } = setup([user], OPERATOR, { tokens: [makeToken(user)] });

    await service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null);

    expect(user.emailVerifiedAt).toBe(EARLIER);
  });

  it('redirects to the carried returnTo when it is safe, else to homeFor(roles)', async () => {
    const first = pendingUser();
    const second = pendingUser({ email: 'two@devmentor.test' });
    const { service } = setup([first, second], OPERATOR, {
      tokens: [makeToken(first, { raw: 'a' }), makeToken(second, { raw: 'b' })],
    });

    await expect(service.setPasswordFromLink({ token: 'a', password: PASSWORD, returnTo: '/invitations/x' }, null)).resolves.toMatchObject({
      redirectTo: '/invitations/x',
    });
    await expect(service.setPasswordFromLink({ token: 'b', password: PASSWORD, returnTo: '//evil.test' }, null)).resolves.toMatchObject({
      redirectTo: '/mentors',
    });
  });

  it('an allowlisted email becomes operator once verified: roles_changed after the commit, lands on /admin', async () => {
    const user = pendingUser({ email: OPERATOR });
    const { service, em, events } = setup([user], OPERATOR, { tokens: [makeToken(user)] });
    const order: string[] = [];
    em.flush.mockImplementation(async () => {
      order.push('flush');
    });
    events.emit.mockImplementation(async () => {
      order.push('emit');
    });

    const result = await service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null);

    expect(result.redirectTo).toBe('/admin');
    expect(user.roles).toEqual(['mentee', 'operator']);
    expect(order).toEqual(['flush', 'emit']);
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', { userId: user.id, roles: ['mentee', 'operator'] });
  });

  it('accepts a session of the same account', async () => {
    const user = pendingUser();
    const { service } = setup([user], OPERATOR, { tokens: [makeToken(user)] });

    await expect(service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, user.id)).resolves.toMatchObject({ user });
  });

  it.each([
    ['unknown', () => [], 'raw-token'],
    ['already used', (user: User) => [makeToken(user, { usedAt: EARLIER })], 'raw-token'],
    ['expired', (user: User) => [makeToken(user, { expiresAt: new Date(NOW.getTime() - 1) })], 'raw-token'],
    ['retired by a resend (expires now)', (user: User) => [makeToken(user, { expiresAt: NOW })], 'raw-token'],
  ])('%s link: 400 VERIFICATION_LINK_INVALID, no hashing, nothing changed', async (_kind, tokensFor, raw) => {
    const user = pendingUser();
    const snapshot = { ...user };
    const { service, em, passwordHasher } = setup([user], OPERATOR, { tokens: tokensFor(user) });
    const withSlot = vi.spyOn(passwordHasher, 'withSlot');

    const result = service.setPasswordFromLink({ token: raw, password: PASSWORD }, null);

    await expect(result).rejects.toBeInstanceOf(VerificationLinkInvalidError);
    await expect(result).rejects.toMatchObject({ status: 400, code: 'VERIFICATION_LINK_INVALID' });
    expect(withSlot).not.toHaveBeenCalled();
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect({ ...user }).toEqual(snapshot);
  });

  it('reuse: the second use of a link is refused and changes nothing', async () => {
    const user = pendingUser();
    const { service } = setup([user], OPERATOR, { tokens: [makeToken(user)] });
    await service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null);
    const after = { ...user };

    await expect(service.setPasswordFromLink({ token: 'raw-token', password: 'another password!' }, null)).rejects.toBeInstanceOf(
      VerificationLinkInvalidError,
    );
    expect({ ...user }).toEqual(after);
  });

  it('L13: a session of another account refuses the link before anything changes', async () => {
    const user = pendingUser();
    const token = makeToken(user);
    const { service, em, passwordHasher, logger } = setup([user], OPERATOR, { tokens: [token] });
    const withSlot = vi.spyOn(passwordHasher, 'withSlot');

    await expect(service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, 'someone-else')).rejects.toMatchObject({
      code: 'VERIFICATION_LINK_INVALID',
    });
    expect(withSlot).not.toHaveBeenCalled();
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(token.usedAt).toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith({ userId: 'someone-else' }, expect.stringContaining('another account'));
  });

  it('a parallel use that consumed the token after our check: 400 and the user is left alone', async () => {
    const user = pendingUser({ sessionVersion: 1 });
    const token = makeToken(user);
    const { service, em } = setup([user], OPERATOR, { tokens: [token] });
    em.nativeUpdate.mockImplementationOnce(async () => {
      token.usedAt = NOW;
      return 0;
    });

    await expect(service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null)).rejects.toBeInstanceOf(
      VerificationLinkInvalidError,
    );
    expect(em.nativeUpdate).toHaveBeenCalledTimes(1);
    expect(user).toMatchObject({ passwordHash: null, sessionVersion: 1, emailVerifiedAt: null });
  });

  // Phase 2 review: a link only sets the first password; one consumed after a password exists
  // (e.g. a resend that raced set-password) must not overwrite it.
  it('an account that already has a password: 400, the link stays unused and the password unchanged', async () => {
    const user = pendingUser({ passwordHash: '$scrypt$existing', sessionVersion: 4 });
    const token = makeToken(user);
    const { service, em, logger } = setup([user], OPERATOR, { tokens: [token] });

    await expect(service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null)).rejects.toBeInstanceOf(
      VerificationLinkInvalidError,
    );
    expect(em.findOneOrFail).toHaveBeenCalledWith(User, { id: user.id }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(token.usedAt).toBeNull();
    expect(user).toMatchObject({ passwordHash: '$scrypt$existing', sessionVersion: 4 });
    expect(logger.warn).toHaveBeenCalledWith({ userId: user.id }, expect.stringContaining('already has a password'));
  });

  it('retires the other live links of the user in the same transaction', async () => {
    const user = pendingUser();
    const other = makeToken(user, { raw: 'other' });
    const foreign = makeToken(makeUser({ email: 'x@devmentor.test' }), { raw: 'foreign' });
    const { service } = setup([user], OPERATOR, { tokens: [makeToken(user), other, foreign] });

    await service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null);

    expect(other).toMatchObject({ usedAt: null, expiresAt: NOW });
    expect(foreign.expiresAt).toEqual(new Date(NOW.getTime() + EMAIL_VERIFICATION_TTL_MS));
  });

  it('a saturated hashing gate answers 503 and leaves the link usable', async () => {
    const user = pendingUser();
    const token = makeToken(user);
    const { service, em, passwordHasher } = setup([user], OPERATOR, { tokens: [token] });
    let release!: () => void;
    const held = passwordHasher.withSlot(() => new Promise<void>((resolve) => (release = resolve)));

    await expect(service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(token.usedAt).toBeNull();

    release();
    await held;
    await expect(service.setPasswordFromLink({ token: 'raw-token', password: PASSWORD }, null)).resolves.toMatchObject({ user });
  });
});

describe('AccountService.verifyPassword', () => {
  async function withPassword(overrides: Partial<User> = {}): Promise<User> {
    return makeUser({ email: 'ada@devmentor.test', emailVerifiedAt: EARLIER, passwordHash: await hashPassword(PASSWORD, TEST_SCRYPT), ...overrides });
  }

  it('returns the user for the right password after consuming the sign-in limits', async () => {
    const user = await withPassword();
    const { service, rateLimiter } = setup([user]);

    await expect(service.verifyPassword({ email: ' Ada@DevMentor.test', password: PASSWORD }, { ip: IP })).resolves.toBe(user);
    expect(rateLimiter.consumeAll).toHaveBeenCalledWith(rateLimitChecks(SIGN_IN_RATE_LIMITS, { email: 'ada@devmentor.test', ip: IP }));
  });

  it('reconciles operator on success', async () => {
    const user = await withPassword({ email: OPERATOR });
    const { service, events } = setup([user]);

    await service.verifyPassword({ email: OPERATOR, password: PASSWORD }, { ip: null });

    expect(user.roles).toEqual(['mentee', 'operator']);
    expect(events.emit).toHaveBeenCalledWith('auth.user.roles_changed', { userId: user.id, roles: ['mentee', 'operator'] });
  });

  it('a wrong password → 401 "Invalid email or password."', async () => {
    const { service } = setup([await withPassword()]);

    await expect(service.verifyPassword({ email: 'ada@devmentor.test', password: 'wrong password' }, { ip: null })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  it.each([
    ['an unknown email', []],
    ['an account without a password (GitHub-only or pending)', [makeUser({ email: 'ada@devmentor.test', githubId: 3 })]],
  ])('%s → the same 401 through the dummy-hash path', async (_kind, users) => {
    const verify = vi.fn(async () => false);
    const passwordHasher = {
      withSlot: <T>(fn: (hashing: { hash: () => Promise<string>; verify: typeof verify }) => Promise<T>) =>
        fn({ hash: async () => 'never', verify }),
    } as unknown as PasswordHasher;
    const { service } = setup(users as User[], OPERATOR, { passwordHasher });

    await expect(service.verifyPassword({ email: 'ada@devmentor.test', password: PASSWORD }, { ip: null })).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(verify).toHaveBeenCalledWith(PASSWORD, null);
  });

  it('rate limited: the 429 propagates before any lookup or hashing', async () => {
    const { service, em, rateLimiter } = setup([await withPassword()]);
    rateLimiter.consumeAll.mockRejectedValueOnce(new TooManyRequestsError(300));

    await expect(service.verifyPassword({ email: 'ada@devmentor.test', password: PASSWORD }, { ip: IP })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 300,
    });
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('a saturated hashing gate answers 503 without consuming the limits', async () => {
    const { service, rateLimiter, passwordHasher } = setup([await withPassword()]);
    let release!: () => void;
    const held = passwordHasher.withSlot(() => new Promise<void>((resolve) => (release = resolve)));

    await expect(service.verifyPassword({ email: 'ada@devmentor.test', password: PASSWORD }, { ip: null })).rejects.toMatchObject({
      status: 503,
    });
    expect(rateLimiter.consumeAll).not.toHaveBeenCalled();

    release();
    await held;
  });
});

describe('AccountService: GitHub sign-in on a registration started by email (rule 2)', () => {
  it('completes the pending account: linked, verified, the unused link still sets a password later', async () => {
    const { service, rows, mailSender } = setup();
    await service.startRegistration({ email: PROFILE.email }, { ip: null });
    const { token } = linkIn(mailSender.send.mock.calls[0][0]);

    const user = await service.resolveGithubAccount(PROFILE);

    expect(rows).toEqual([user]);
    expect(user).toMatchObject({ githubId: PROFILE.githubId, emailVerifiedAt: NOW });
    await expect(service.setPasswordFromLink({ token, password: PASSWORD }, user.id)).resolves.toMatchObject({ user });
  });
});
