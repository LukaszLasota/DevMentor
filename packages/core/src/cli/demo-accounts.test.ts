import { User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { hashPassword, PasswordHasher, verifyPassword } from '../security/password';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemoAccounts, type SeedDeps } from './demo-accounts';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const EARLIER = new Date('2026-10-01T08:00:00.000Z');
const LOW_COST = { logN: 4, r: 8, p: 1 };
const githubIdFor = (login: string) => login.length * 1000;

/** In-memory `em`: `findOne` by equal fields, `create` appends, `transactional` runs on itself. */
function fakeEm(rows: User[]) {
  const em = {
    findOne: vi.fn(async (_entity: unknown, where: Record<string, unknown>) =>
      rows.find((row) => Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)) ??
      null,
    ),
    create: vi.fn((_entity: unknown, data: Partial<User>) => {
      const user = Object.assign(new User(), { sessionVersion: 0, ...data });
      rows.push(user);
      return user;
    }),
    transactional: vi.fn(async (fn: (inner: unknown) => Promise<unknown>) => fn(em)),
  };

  return em;
}

function deps(rows: User[], operatorEmails = 'mock-operator@devmentor.test'): SeedDeps & { em: ReturnType<typeof fakeEm> } {
  return {
    em: fakeEm(rows),
    env: parseEnv({ DATABASE_URL: 'postgres://localhost/test', OPERATOR_EMAILS: operatorEmails }),
    clock: { now: () => NOW },
    passwordHasher: new PasswordHasher({ concurrency: 1, waitMs: 1_000, params: LOW_COST }),
  } as SeedDeps & { em: ReturnType<typeof fakeEm> };
}

const seed = (d: ReturnType<typeof deps>) => seedDemoAccounts(d as unknown as SeedDeps & { em: Cradle['em'] }, githubIdFor);
const byEmail = (rows: User[], email: string) => rows.find((row) => row.email === email) as User;

describe('seedDemoAccounts', () => {
  it('creates every demo account in one transaction', async () => {
    const rows: User[] = [];
    const d = deps(rows);

    const results = await seed(d);

    expect(d.em.transactional).toHaveBeenCalledOnce();
    expect(results.map(({ account, roles, status }) => [account.email, roles, status])).toEqual([
      ['mock-mentee@devmentor.test', ['mentee'], 'created'],
      ['mock-operator@devmentor.test', ['mentee', 'operator'], 'created'],
      ['mock-github-only@devmentor.test', ['mentee'], 'created'],
      ['mock-pending@example.com', ['mentee'], 'created'],
    ]);

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

  it('changes nothing when run again (same hashes, same session versions)', async () => {
    const rows: User[] = [];
    await seed(deps(rows));
    const before = rows.map((row) => ({ ...row }));

    const results = await seed(deps(rows));

    expect(results.map(({ status }) => status)).toEqual(['unchanged', 'unchanged', 'unchanged', 'unchanged']);
    expect(rows.map((row) => ({ ...row }))).toEqual(before);
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

    expect(results.map(({ status }) => status)).toEqual(['updated', 'created', 'updated', 'updated']);
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

    expect(results[1].roles).toEqual(['mentee']);
    expect(byEmail(rows, 'mock-operator@devmentor.test').roles).toEqual(['mentee']);
  });

  it('stops without changes when a demo GitHub identity belongs to another account', async () => {
    const other = Object.assign(new User(), { email: 'someone@devmentor.test', githubId: githubIdFor('mock-operator') });
    const rows = [other];

    await expect(seed(deps(rows))).rejects.toThrow(
      'The GitHub identity of stub persona "mock-operator" is linked to someone@devmentor.test; nothing was changed.',
    );
  });

  it('lists accounts with every sign-in situation the demo needs', () => {
    expect(DEMO_ACCOUNTS.map(({ email, password, githubLogin, verified }) => [email, password, githubLogin !== null, verified])).toEqual([
      ['mock-mentee@devmentor.test', true, true, true],
      ['mock-operator@devmentor.test', true, true, true],
      ['mock-github-only@devmentor.test', false, true, true],
      ['mock-pending@example.com', false, false, false],
    ]);
  });
});
