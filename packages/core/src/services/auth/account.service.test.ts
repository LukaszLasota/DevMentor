import { UniqueConstraintViolationException, User, type Role } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import {
  AccountService,
  effectiveRoles,
  GithubAccountConflictError,
  normalizeEmail,
  normalizeRoles,
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

/**
 * In-memory stand-in for the scoped `EntityManager`: `findOne` matches on equal fields, `create`
 * adds a row (like `persistOnCreate`), `flush` resolves unless a test makes it fail.
 */
function fakeEm(rows: User[]) {
  return {
    findOne: vi.fn(async (_entity: unknown, where: Record<string, unknown>) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => row[key as keyof User] === value)) ?? null,
    ),
    create: vi.fn((_entity: unknown, data: Partial<User>) => {
      const user = makeUser(data);
      rows.push(user);
      return user;
    }),
    // Conditional UPDATE: changes the rows matching every `where` field, returns the affected count.
    nativeUpdate: vi.fn(async (_entity: unknown, where: Record<string, unknown>, data: Partial<User>) => {
      const matches = rows.filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof User] === value));
      matches.forEach((row) => Object.assign(row, data));
      return matches.length;
    }),
    // Rows are the managed entities themselves, so a refresh has nothing to reload.
    refreshOrFail: vi.fn(async (user: User) => user),
    flush: vi.fn(async () => undefined),
    clear: vi.fn(),
  };
}

function setup(rows: User[] = [], operatorEmails = OPERATOR) {
  const em = fakeEm(rows);
  const events = { emit: vi.fn(async () => undefined) };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const service = new AccountService({
    em: em as unknown as Cradle['em'],
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', OPERATOR_EMAILS: operatorEmails }),
    clock: { now: () => NOW },
    events: events as unknown as Cradle['events'],
    logger: logger as unknown as Cradle['logger'],
  });

  return { service, em, events, logger, rows };
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
