import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env';
import type { SeedResult } from './demo-accounts';

const { orm, getOrm, getEnv, seedDemoAccounts } = vi.hoisted(() => {
  const orm = { em: { fork: vi.fn(() => 'forked-em') }, close: vi.fn(async () => undefined) };

  return {
    orm,
    getOrm: vi.fn<(options: unknown) => Promise<typeof orm>>(async () => orm),
    getEnv: vi.fn<() => Env>(),
    seedDemoAccounts: vi.fn<(...args: unknown[]) => Promise<SeedResult[]>>(),
  };
});
vi.mock('@devmentor/db', async (importOriginal) => ({ ...(await importOriginal<object>()), getOrm }));
vi.mock('../config/env', async (importOriginal) => ({ ...(await importOriginal<object>()), getEnv }));
vi.mock('./demo-accounts', async (importOriginal) => ({ ...(await importOriginal<object>()), seedDemoAccounts }));

const { parseEnv } = await import('../config/env');
const { DEMO_ACCOUNTS } = await import('./demo-accounts');
const { databaseHost, formatSeedReport, runSeedCli, SEED_REFUSED_IN_PRODUCTION, seedRefusedRemoteDatabase } = await import('./seed-cli');

const env = (overrides: Record<string, string> = {}) => parseEnv({ DATABASE_URL: 'postgres://localhost/dev', ...overrides });
const [mentee, , operator, githubOnly, pending] = DEMO_ACCOUNTS;
const RESULTS: SeedResult[] = [
  { account: mentee, roles: ['mentee'], status: 'created' },
  { account: operator, roles: ['mentee', 'operator'], status: 'unchanged' },
  { account: githubOnly, roles: ['mentee'], status: 'updated' },
  { account: pending, roles: ['mentee'], status: 'created' },
];

function run(argv?: string[]) {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const githubIdFor = vi.fn(() => 1);

  return { stdout, stderr, githubIdFor, code: runSeedCli({ argv, githubIdFor, stdout, stderr }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getEnv.mockReturnValue(env());
  seedDemoAccounts.mockResolvedValue(RESULTS);
});

describe('formatSeedReport', () => {
  it('prints an aligned table of the accounts and the password', () => {
    expect(formatSeedReport(RESULTS)).toBe(
      [
        'Demo accounts (development only):',
        '',
        'Email                            Roles             Sign in with                                 Status',
        'mock-mentee@devmentor.test       mentee            password, GitHub stub (login=mock-mentee)    created',
        'mock-operator@devmentor.test     mentee, operator  password, GitHub stub (login=mock-operator)  unchanged',
        'mock-github-only@devmentor.test  mentee            GitHub stub (login=mock-github-only)         updated',
        'mock-pending@example.com         mentee            none (pending registration)                  created',
        '',
        'Password: mock-password-not-a-secret',
      ].join('\n'),
    );
  });

  it('notes an operator persona that OPERATOR_EMAILS does not list', () => {
    const report = formatSeedReport([{ account: operator, roles: ['mentee'], status: 'created' }]);

    expect(report.split('\n').at(-1)).toBe('Note: mock-operator@devmentor.test is not in OPERATOR_EMAILS, so it is a mentee only.');
  });
});

describe('runSeedCli', () => {
  it('seeds through a dedicated quiet ORM, prints the report and closes the pool', async () => {
    const { stdout, stderr, githubIdFor, code } = run();

    expect(await code).toBe(0);
    expect(getOrm).toHaveBeenCalledWith({ clientUrl: 'postgres://localhost/dev', pool: { min: 0, max: 1 }, debug: false });
    expect(seedDemoAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ em: 'forked-em', env: getEnv.mock.results[0].value, passwordHasher: expect.anything() }),
      githubIdFor,
    );
    const [[deps]] = seedDemoAccounts.mock.calls as [[{ clock: { now(): Date } }]];
    expect(deps.clock.now()).toBeInstanceOf(Date);
    expect(stdout).toHaveBeenCalledWith(formatSeedReport(RESULTS));
    expect(stderr).not.toHaveBeenCalled();
    expect(orm.close).toHaveBeenCalledOnce();
  });

  it('refuses to run in production before touching the database', async () => {
    getEnv.mockReturnValue(env({ NODE_ENV: 'production' }));
    const { stdout, stderr, code } = run();

    expect(await code).toBe(1);
    expect(stderr).toHaveBeenCalledWith(SEED_REFUSED_IN_PRODUCTION);
    expect(getOrm).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
  });

  it.each([
    'postgres://devmentor:devmentor@localhost:5432/devmentor',
    'postgresql://u:p@LOCALHOST/dev',
    'postgres://u:p@127.0.0.1:55001/test',
    'postgres://u:p@[::1]:5432/dev',
  ])('seeds a local database without the flag: %s', async (url) => {
    getEnv.mockReturnValue(env({ DATABASE_URL: url }));
    const { stderr, code } = run();

    expect(await code).toBe(0);
    expect(stderr).not.toHaveBeenCalled();
    expect(getOrm).toHaveBeenCalledOnce();
  });

  it.each([
    ['postgres://admin:s3cret@db.example.com:5432/devmentor', 'db.example.com'],
    ['postgres://admin:s3cret@10.0.0.5/devmentor', '10.0.0.5'],
    ['postgres:///devmentor?host=/var/run/postgresql', ''],
  ])('refuses a non-local database before touching it, without printing credentials: %s', async (url, host) => {
    getEnv.mockReturnValue(env({ DATABASE_URL: url }));
    const { stdout, stderr, code } = run();

    expect(await code).toBe(1);
    expect(stderr).toHaveBeenCalledWith(seedRefusedRemoteDatabase(host));
    expect(String(stderr.mock.calls[0][0])).not.toContain('s3cret');
    expect(getOrm).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
  });

  it('explains the refusal and the opt-in flag', () => {
    expect(seedRefusedRemoteDatabase('db.example.com')).toBe(
      [
        'db:seed refuses to run against the database host "db.example.com": the demo accounts have a published password,',
        'so it only seeds a local database (localhost, 127.0.0.1, ::1). NODE_ENV is not enough: it defaults to development.',
        'If this is a disposable database, run it again with --allow-remote-database (npm run db:seed -- --allow-remote-database).',
      ].join('\n'),
    );
  });

  it('seeds a non-local database with --allow-remote-database', async () => {
    getEnv.mockReturnValue(env({ DATABASE_URL: 'postgres://u:p@db.example.com/dev' }));
    const { stderr, code } = run(['--allow-remote-database']);

    expect(await code).toBe(0);
    expect(stderr).not.toHaveBeenCalled();
    expect(getOrm).toHaveBeenCalledWith(expect.objectContaining({ clientUrl: 'postgres://u:p@db.example.com/dev' }));
  });

  it('still refuses production with --allow-remote-database', async () => {
    getEnv.mockReturnValue(env({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db.example.com/dev' }));
    const { stderr, code } = run(['--allow-remote-database']);

    expect(await code).toBe(1);
    expect(stderr).toHaveBeenCalledWith(SEED_REFUSED_IN_PRODUCTION);
    expect(getOrm).not.toHaveBeenCalled();
  });

  it('rejects an unknown argument before touching the database', async () => {
    const { stderr, code } = run(['--force']);

    expect(await code).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/^db:seed failed: Unknown option '--force'/));
    expect(getOrm).not.toHaveBeenCalled();
  });

  it('reports a failed seed, closes the pool and exits with 1', async () => {
    seedDemoAccounts.mockRejectedValue(new Error('linked elsewhere'));
    const { stdout, stderr, code } = run();

    expect(await code).toBe(1);
    expect(stderr).toHaveBeenCalledWith('db:seed failed: linked elsewhere');
    expect(stdout).not.toHaveBeenCalled();
    expect(orm.close).toHaveBeenCalledOnce();
  });

  it('reports a non-Error failure as text', async () => {
    getEnv.mockImplementation(() => {
      throw 'env unreadable';
    });
    const { stderr, code } = run();

    expect(await code).toBe(1);
    expect(stderr).toHaveBeenCalledWith('db:seed failed: env unreadable');
  });
});

describe('databaseHost', () => {
  it('returns the lower-cased host, or an empty string for a socket or an unparsable URL', () => {
    expect(databaseHost('postgres://u:p@DB.Example.com:5432/x')).toBe('db.example.com');
    expect(databaseHost('postgres:///x')).toBe('');
    expect(databaseHost('postgres://[bad')).toBe('');
  });
});
