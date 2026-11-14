import { parseArgs } from 'node:util';
import { getOrm } from '@devmentor/db';
import { getEnv } from '../config/env';
import { PasswordHasher } from '../security/password';
import { systemClock } from '../time/clock';
import { DEMO_PASSWORD, seedDemoAccounts, type GithubIdFor, type SeedResult } from './demo-accounts';

export const SEED_REFUSED_IN_PRODUCTION =
  'db:seed refuses to run with NODE_ENV=production: the demo accounts have a published password.';

export const ALLOW_REMOTE_DATABASE_FLAG = '--allow-remote-database';

/** Hosts of the databases this repo seeds: compose and testcontainers both publish on the loopback. */
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Why the seed refuses `DATABASE_URL` (host only, never the credentials). */
export function seedRefusedRemoteDatabase(host: string): string {
  return [
    `db:seed refuses to run against the database host "${host}": the demo accounts have a published password,`,
    `so it only seeds a local database (localhost, 127.0.0.1, ::1). NODE_ENV is not enough: it defaults to development.`,
    `If this is a disposable database, run it again with ${ALLOW_REMOTE_DATABASE_FLAG} (npm run db:seed -- ${ALLOW_REMOTE_DATABASE_FLAG}).`,
  ].join('\n');
}

/** The host of a `postgres://` URL, lower-cased; `''` when it has none (socket) or does not parse. */
export function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export interface SeedCliOptions {
  /** Command-line arguments after the script name; only `--allow-remote-database` is accepted. */
  argv?: readonly string[];
  githubIdFor: GithubIdFor;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

function signInMethods({ account }: SeedResult): string {
  const methods = [
    ...(account.password ? ['password'] : []),
    ...(account.githubLogin === null ? [] : [`GitHub stub (login=${account.githubLogin})`]),
  ];

  return methods.length > 0 ? methods.join(', ') : 'none (pending registration)';
}

/** Plain-text table of the seeded accounts, with the password and any operator caveat. */
export function formatSeedReport(results: readonly SeedResult[]): string {
  const rows = [
    ['Email', 'Roles', 'Sign in with', 'Status'],
    ...results.map((result) => [result.account.email, result.roles.join(', '), signInMethods(result), result.status]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const table = rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd());
  const notOperators = results
    .filter(({ account, roles }) => account.operator && !roles.includes('operator'))
    .map(({ account }) => `Note: ${account.email} is not in OPERATOR_EMAILS, so it is a mentee only.`);

  return [
    'Demo accounts (development only):',
    '',
    ...table,
    '',
    `Password: ${DEMO_PASSWORD}`,
    ...notOperators,
  ].join('\n');
}

/**
 * `npm run db:seed`: creates or restores the demo accounts in the database of `DATABASE_URL`.
 * Refuses `NODE_ENV=production`, and a non-local database host unless `--allow-remote-database`
 * is passed: `NODE_ENV` defaults to development, so it alone would not stop a seed of a live database.
 * A one-shot process, so it builds only what the seeder needs instead of the request container
 * (no SQL debug log, no mailer) and closes the pool at the end. Returns the exit code.
 */
export async function runSeedCli({ argv = [], githubIdFor, stdout, stderr }: SeedCliOptions): Promise<number> {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { 'allow-remote-database': { type: 'boolean', default: false } },
      strict: true,
    });
    const env = getEnv();

    if (env.NODE_ENV === 'production') {
      stderr(SEED_REFUSED_IN_PRODUCTION);
      return 1;
    }

    const host = databaseHost(env.DATABASE_URL);

    if (!LOCAL_DATABASE_HOSTS.has(host) && !values['allow-remote-database']) {
      stderr(seedRefusedRemoteDatabase(host));
      return 1;
    }

    const orm = await getOrm({ clientUrl: env.DATABASE_URL, pool: { min: 0, max: 1 }, debug: false });

    try {
      const passwordHasher = new PasswordHasher({
        concurrency: env.PASSWORD_HASH_CONCURRENCY,
        waitMs: env.PASSWORD_HASH_WAIT_MS,
      });
      const results = await seedDemoAccounts({ em: orm.em.fork(), env, clock: systemClock, passwordHasher }, githubIdFor);

      stdout(formatSeedReport(results));
    } finally {
      await orm.close();
    }

    return 0;
  } catch (error) {
    stderr(`db:seed failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
