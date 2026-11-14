import { MentorProfile, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { hashPassword, PasswordHasher, verifyPassword } from '../security/password';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemoAccounts, type SeedDeps } from './demo-accounts';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const EARLIER = new Date('2026-10-01T08:00:00.000Z');
const LOW_COST = { logN: 4, r: 8, p: 1 };
// Distinct per login (a length-based id would collide for mock-mentee/mock-mentor).
const githubIdFor = (login: string) => [...login].reduce((id, char) => (id * 31 + char.charCodeAt(0)) % 1_000_000_007, 7);

const WINDOW_DAYS = 14;
const DEADLINE = new Date(NOW.getTime() + WINDOW_DAYS * 86_400_000);

/**
 * In-memory `em`: `findOne` by equal fields (a `MentorProfile` by its user's id), `create` appends
 * (users get an id), `transactional` runs on itself.
 */
function fakeEm(rows: User[], profiles: MentorProfile[]) {
  let nextId = 0;
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === MentorProfile) {
        return profiles.find((profile) => (profile.user as unknown as User).id === where.user) ?? null;
      }

      return (
        rows.find((row) => Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)) ??
        null
      );
    }),
    create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
      if (entity === MentorProfile) {
        const profile = Object.assign(new MentorProfile(), data);
        profiles.push(profile);
        return profile;
      }

      nextId += 1;
      const user = Object.assign(new User(), { id: `user-${nextId}`, sessionVersion: 0, ...data });
      rows.push(user);
      return user;
    }),
    transactional: vi.fn(async (fn: (inner: unknown) => Promise<unknown>) => fn(em)),
  };

  return em;
}

function deps(
  rows: User[],
  operatorEmails = 'mock-operator@devmentor.test',
  profiles: MentorProfile[] = [],
): SeedDeps & { em: ReturnType<typeof fakeEm> } {
  return {
    em: fakeEm(rows, profiles),
    env: parseEnv({
      DATABASE_URL: 'postgres://localhost/test',
      OPERATOR_EMAILS: operatorEmails,
      MENTOR_PUBLISH_WINDOW_DAYS: String(WINDOW_DAYS),
    }),
    clock: { now: () => NOW },
    passwordHasher: new PasswordHasher({ concurrency: 1, waitMs: 1_000, params: LOW_COST }),
  } as SeedDeps & { em: ReturnType<typeof fakeEm> };
}

const seed = (d: ReturnType<typeof deps>) => seedDemoAccounts(d as unknown as SeedDeps & { em: Cradle['em'] }, githubIdFor);
const byEmail = (rows: User[], email: string) => rows.find((row) => row.email === email) as User;
const profileOf = (profiles: MentorProfile[], user: User) => profiles.filter((profile) => (profile.user as unknown as User) === user);

describe('seedDemoAccounts', () => {
  it('creates every demo account in one transaction, mentors with a profile', async () => {
    const rows: User[] = [];
    const profiles: MentorProfile[] = [];
    const d = deps(rows, undefined, profiles);

    const results = await seed(d);

    expect(d.em.transactional).toHaveBeenCalledOnce();
    expect(results.map(({ account, roles, status }) => [account.email, roles, status])).toEqual([
      ['mock-mentee@devmentor.test', ['mentee'], 'created'],
      ['mock-mentor@devmentor.test', ['mentee', 'mentor'], 'created'],
      ['mock-operator@devmentor.test', ['mentee', 'mentor', 'operator'], 'created'],
      ['mock-github-only@devmentor.test', ['mentee'], 'created'],
      ['mock-pending@example.com', ['mentee'], 'created'],
    ]);
    expect(profiles).toHaveLength(2);
    for (const email of ['mock-mentor@devmentor.test', 'mock-operator@devmentor.test']) {
      expect(profileOf(profiles, byEmail(rows, email))).toEqual([expect.objectContaining({ initialPublishDueAt: DEADLINE })]);
    }
    expect(byEmail(rows, 'mock-mentor@devmentor.test')).toMatchObject({
      githubId: githubIdFor('mock-mentor'),
      githubLogin: 'mock-mentor',
      emailVerifiedAt: NOW,
    });

    const mentee = byEmail(rows, 'mock-mentee@devmentor.test');
    expect(mentee).toMatchObject({ githubId: githubIdFor('mock-mentee'), githubLogin: 'mock-mentee', emailVerifiedAt: NOW });
    expect(await verifyPassword(DEMO_PASSWORD, mentee.passwordHash as string)).toBe(true);
    expect(byEmail(rows, 'mock-github-only@devmentor.test')).toMatchObject({
      githubId: githubIdFor('mock-github-only'),
      passwordHash: null,
      emailVerifiedAt: NOW,
    });
    expect(byEmail(rows, 'mock-pending@example.com')).toMatchObject({
      githubId: null,
      githubLogin: null,
      passwordHash: null,
      emailVerifiedAt: null,
    });
  });

  it('changes nothing when run again (same hashes, session versions and deadlines)', async () => {
    const rows: User[] = [];
    const profiles: MentorProfile[] = [];
    await seed(deps(rows, undefined, profiles));
    const before = rows.map((row) => ({ ...row }));
    const deadlines = profiles.map((profile) => profile.initialPublishDueAt);

    const results = await seed(deps(rows, undefined, profiles));

    expect(results.map(({ status }) => status)).toEqual(['unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged']);
    expect(rows.map((row) => ({ ...row }))).toEqual(before);
    expect(profiles.map((profile) => profile.initialPublishDueAt)).toEqual(deadlines);
  });

  it('gives an existing mentor account a missing profile or deadline, never moving a set one', async () => {
    const rows: User[] = [];
    const profiles: MentorProfile[] = [];
    await seed(deps(rows, undefined, profiles));
    const mentor = byEmail(rows, 'mock-mentor@devmentor.test');
    const operator = byEmail(rows, 'mock-operator@devmentor.test');
    profiles.splice(profiles.indexOf(profileOf(profiles, mentor)[0]), 1);
    profileOf(profiles, operator)[0].initialPublishDueAt = null;

    const results = await seed(deps(rows, undefined, profiles));

    expect(results.map(({ status }) => status)).toEqual(['unchanged', 'updated', 'updated', 'unchanged', 'unchanged']);
    expect(mentor.sessionVersion).toBe(0);
    expect(profileOf(profiles, mentor)).toEqual([expect.objectContaining({ initialPublishDueAt: DEADLINE })]);
    expect(profileOf(profiles, operator)[0].initialPublishDueAt).toEqual(DEADLINE);
  });

  it('puts back a removed mentor role and ends the sessions of that account', async () => {
    const rows: User[] = [];
    const profiles: MentorProfile[] = [];
    await seed(deps(rows, undefined, profiles));
    const mentor = byEmail(rows, 'mock-mentor@devmentor.test');
    mentor.roles = ['mentee'];

    const [, result] = await seed(deps(rows, undefined, profiles));

    expect(result).toMatchObject({ roles: ['mentee', 'mentor'], status: 'updated' });
    expect(mentor).toMatchObject({ roles: ['mentee', 'mentor'], sessionVersion: 1 });
    expect(profiles).toHaveLength(2);
  });

  it('restores the demo state of changed demo accounts and ends their sessions', async () => {
    const rows = [
      Object.assign(new User(), {
        email: 'mock-mentee@devmentor.test',
        roles: ['mentee'],
        sessionVersion: 3,
        githubId: null,
        githubLogin: null,
        passwordHash: await hashPassword('a password the user changed', LOW_COST),
        emailVerifiedAt: EARLIER,
      }),
      Object.assign(new User(), {
        email: 'mock-github-only@devmentor.test',
        roles: ['mentee'],
        sessionVersion: 0,
        githubId: githubIdFor('mock-github-only'),
        githubLogin: 'mock-github-only',
        passwordHash: 'not a hash format the app knows',
        emailVerifiedAt: EARLIER,
      }),
      Object.assign(new User(), {
        email: 'mock-pending@example.com',
        roles: ['mentee'],
        sessionVersion: 1,
        githubId: null,
        githubLogin: null,
        passwordHash: await hashPassword('set through the link', LOW_COST),
        emailVerifiedAt: EARLIER,
      }),
    ];

    const results = await seed(deps(rows));

    expect(results.map(({ status }) => status)).toEqual(['updated', 'created', 'created', 'updated', 'updated']);
    const mentee = byEmail(rows, 'mock-mentee@devmentor.test');
    expect(mentee).toMatchObject({ sessionVersion: 4, githubLogin: 'mock-mentee', emailVerifiedAt: EARLIER });
    expect(await verifyPassword(DEMO_PASSWORD, mentee.passwordHash as string)).toBe(true);
    expect(byEmail(rows, 'mock-github-only@devmentor.test')).toMatchObject({ sessionVersion: 1, passwordHash: null });
    expect(byEmail(rows, 'mock-pending@example.com')).toMatchObject({
      sessionVersion: 2,
      passwordHash: null,
      emailVerifiedAt: null,
    });
  });

  it('rehashes a demo password whose stored hash is malformed', async () => {
    const rows = [
      Object.assign(new User(), {
        email: 'mock-mentee@devmentor.test',
        roles: ['mentee'],
        sessionVersion: 0,
        githubId: githubIdFor('mock-mentee'),
        githubLogin: 'mock-mentee',
        passwordHash: 'corrupt',
        emailVerifiedAt: EARLIER,
      }),
    ];

    const [mentee] = await seed(deps(rows));

    expect(mentee.status).toBe('updated');
    expect(await verifyPassword(DEMO_PASSWORD, rows[0].passwordHash as string)).toBe(true);
  });

  it('gives the operator persona no operator role unless OPERATOR_EMAILS lists it', async () => {
    const rows: User[] = [];

    const results = await seed(deps(rows, ''));

    expect(results[2].roles).toEqual(['mentee', 'mentor']);
    expect(byEmail(rows, 'mock-operator@devmentor.test').roles).toEqual(['mentee', 'mentor']);
  });

  it('stops without changes when a demo GitHub identity belongs to another account', async () => {
    const other = Object.assign(new User(), { email: 'someone@devmentor.test', githubId: githubIdFor('mock-operator') });
    const rows = [other];

    await expect(seed(deps(rows))).rejects.toThrow(
      'The GitHub identity of stub persona "mock-operator" is linked to someone@devmentor.test; nothing was changed.',
    );
  });

  it('lists accounts with every sign-in situation the demo needs', () => {
    expect(
      DEMO_ACCOUNTS.map(({ email, password, githubLogin, verified, mentor }) => [email, password, githubLogin !== null, verified, mentor]),
    ).toEqual([
      ['mock-mentee@devmentor.test', true, true, true, false],
      ['mock-mentor@devmentor.test', true, true, true, true],
      ['mock-operator@devmentor.test', true, true, true, true],
      ['mock-github-only@devmentor.test', false, true, true, false],
      ['mock-pending@example.com', false, false, false, false],
    ]);
  });
});
