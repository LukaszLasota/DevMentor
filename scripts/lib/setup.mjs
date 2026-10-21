// `npm run setup` logic: an idempotent local installer for README "Getting started".
// Node built-ins only — it has to run before `npm install`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const MIN_NODE_MAJOR = 22;
const STAMP = join('node_modules', '.devmentor-setup');
const NATIVE_DB_HINT =
  'Start Docker, or use a native PostgreSQL: set DATABASE_URL in .env and re-run `npm run setup`.';

export const NEXT_STEPS = [
  'Setup complete. Start the app with:',
  '  npm run dev',
  '  Public site:  http://localhost:3000',
  '  Admin panel:  http://localhost:3000/admin',
  '  Health check: http://localhost:3000/api/health',
].join('\n');

/** A step failure the user can act on: what went wrong and the manual way forward. */
export class StepError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

const done = (detail, warnings = []) => ({ status: 'done', detail, warnings });
const skipped = (detail, warnings = []) => ({ status: 'skipped', detail, warnings });

/** Runs a command from the repo root; on Windows through the shell so `npm.cmd` resolves. */
export function runCommand(command, args, { capture = false, platform = process.platform } = {}) {
  const options = { cwd: ROOT, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' };
  const result =
    platform === 'win32'
      ? spawnSync([command, ...args].join(' '), { ...options, shell: true })
      : spawnSync(command, args, options);

  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

/** Resolves true when something accepts TCP connections on host:port. */
export function probePort(host, port, { open = connect, timeout = 1000 } = {}) {
  return new Promise((resolve) => {
    const socket = open({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** `KEY=value` pairs of a dotenv file; comments, inline ` # comments` and blank lines are ignored. */
export function parseEnv(text) {
  const entries = new Map();

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      const quoted = /^(['"])(.*)\1$/.exec(match[2]);
      entries.set(match[1], quoted ? quoted[2] : match[2].replace(/\s+#.*$/, ''));
    }
  }

  return entries;
}

/** The postgres service containers in `docker compose ps --format json` output (array or NDJSON). */
export function postgresContainers(output) {
  try {
    return output
      .split('\n')
      .filter((line) => line.trim())
      .flatMap((line) => [JSON.parse(line)].flat())
      .filter((container) => container.Service === 'postgres');
  } catch {
    return [];
  }
}

const readEnvFile = (root, name) => parseEnv(readFileSync(join(root, name), 'utf8'));

export function checkNode({ nodeVersion }) {
  if (Number(nodeVersion.split('.')[0]) < MIN_NODE_MAJOR) {
    throw new StepError(
      `Node.js ${MIN_NODE_MAJOR}+ is required, found ${nodeVersion}`,
      `Install Node.js ${MIN_NODE_MAJOR} or newer, then re-run \`npm run setup\`.`,
    );
  }

  return done(`v${nodeVersion}`);
}

const lockfileHash = (root) =>
  createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex');

export function installDependencies({ root, run }) {
  const stampPath = join(root, STAMP);

  if (existsSync(stampPath) && readFileSync(stampPath, 'utf8') === lockfileHash(root)) {
    return skipped('package-lock.json unchanged since the last install');
  }

  if (run('npm', ['install']).status !== 0) {
    throw new StepError('npm install failed', 'Fix the error above, then run `npm install` or re-run `npm run setup`.');
  }

  // Hash after the install: npm may rewrite an out-of-sync lockfile.
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeFileSync(stampPath, lockfileHash(root));

  return done('installed');
}

export function createEnv({ root }) {
  const envPath = join(root, '.env');

  if (!existsSync(envPath)) {
    copyFileSync(join(root, '.env.example'), envPath);
    return done('created from .env.example');
  }

  const current = readEnvFile(root, '.env');
  const missing = [...readEnvFile(root, '.env.example').keys()].filter((key) => !current.has(key));
  const warnings = missing.length > 0 ? [`.env is missing keys from .env.example: ${missing.join(', ')}`] : [];

  return skipped('.env already exists (never overwritten)', warnings);
}

export async function startDatabase({ root, run, env, probePort: probe }) {
  const defaultUrl = readEnvFile(root, '.env.example').get('DATABASE_URL');
  const databaseUrl = env.DATABASE_URL || readEnvFile(root, '.env').get('DATABASE_URL') || defaultUrl;

  if (databaseUrl !== defaultUrl) {
    return skipped('DATABASE_URL points to your own PostgreSQL');
  }

  const compose = run('docker', ['compose', 'version'], { capture: true }).status === 0;
  const containers = compose
    ? postgresContainers(run('docker', ['compose', 'ps', '--format', 'json', 'postgres'], { capture: true }).stdout)
    : [];

  if (containers.some((container) => container.Health === 'healthy')) {
    return skipped('postgres container is running and healthy');
  }

  // Probe only without our container: a starting one already accepts TCP through docker-proxy.
  const { hostname, port } = new URL(defaultUrl);
  if (containers.length === 0 && (await probe(hostname, Number(port || 5432)))) {
    return skipped(`a PostgreSQL server already listens on ${hostname}:${port || 5432}`);
  }

  if (!compose) {
    throw new StepError('Docker Compose v2 is not available', NATIVE_DB_HINT);
  }

  if (run('docker', ['compose', 'up', '-d', '--wait', 'postgres']).status !== 0) {
    throw new StepError('docker compose could not start postgres', NATIVE_DB_HINT);
  }

  return done('postgres container started and healthy');
}

export function runMigrations({ run }) {
  if (run('npm', ['run', 'db:migrate']).status !== 0) {
    throw new StepError(
      'migrations failed',
      'Check that PostgreSQL is reachable at DATABASE_URL in .env, then run `npm run db:migrate`.',
    );
  }

  return done('database schema up to date');
}

export const STEPS = [
  ['Node.js', checkNode],
  ['Dependencies', installDependencies],
  ['.env', createEnv],
  ['PostgreSQL', startDatabase],
  ['Migrations', runMigrations],
];

/** Runs every step in order, stopping at the first failure; returns the process exit code. */
export async function main(overrides = {}) {
  const context = {
    root: ROOT,
    run: runCommand,
    env: process.env,
    nodeVersion: process.versions.node,
    probePort,
    log: console.log,
    logError: console.error,
    ...overrides,
  };

  for (const [name, step] of STEPS) {
    try {
      const { status, detail, warnings } = await step(context);
      context.log(`${status === 'skipped' ? '↷' : '✓'} ${name} — ${detail}`);
      warnings.forEach((warning) => context.log(`  ! ${warning}`));
    } catch (error) {
      if (!(error instanceof StepError)) {
        throw error;
      }

      context.logError(`✗ ${name} — ${error.message}`);
      context.logError(`  ${error.hint}`);
      return 1;
    }
  }

  context.log(NEXT_STEPS);
  return 0;
}
