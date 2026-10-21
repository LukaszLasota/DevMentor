import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSync = vi.fn();
vi.mock('node:child_process', () => ({ spawnSync }));

const {
  NEXT_STEPS,
  ROOT,
  StepError,
  checkNode,
  createEnv,
  installDependencies,
  postgresContainers,
  main,
  parseEnv,
  probePort,
  runCommand,
  runMigrations,
  startDatabase,
} = await import('./setup.mjs');

const DEFAULT_URL = 'postgres://devmentor:devmentor@localhost:5432/devmentor';
const EXAMPLE = `# comment\nDATABASE_URL=${DEFAULT_URL}\nLOG_LEVEL=info\n`;

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'devmentor-setup-'));
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
  writeFileSync(join(root, '.env.example'), EXAMPLE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Fake `run`: answers by command line, records every call. */
function fakeRun(answers = {}) {
  const run = vi.fn((command, args) => answers[[command, ...args].join(' ')] ?? { status: 0, stdout: '' });
  return run;
}

const healthy = JSON.stringify({ Service: 'postgres', Health: 'healthy' });

describe('runCommand', () => {
  afterEach(() => spawnSync.mockReset());

  it('spawns the command with an args array from the repo root and inherits stdio', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: null });

    expect(runCommand('npm', ['install'], { platform: 'linux' })).toEqual({ status: 0, stdout: '' });
    expect(spawnSync).toHaveBeenCalledWith('npm', ['install'], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  });

  it('passes one command string through the shell on Windows and can capture output', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'v2' });

    expect(runCommand('docker', ['compose', 'version'], { capture: true, platform: 'win32' })).toEqual({
      status: 0,
      stdout: 'v2',
    });
    expect(spawnSync).toHaveBeenCalledWith('docker compose version', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      shell: true,
    });
  });

  it('reports a command that could not start as a failure', () => {
    spawnSync.mockReturnValue({ status: null, stdout: '' });

    expect(runCommand('docker', ['compose', 'version']).status).toBe(1);
  });
});

describe('probePort', () => {
  function fakeSocket(event) {
    const socket = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() });
    const open = vi.fn(() => {
      queueMicrotask(() => socket.emit(event));
      return socket;
    });
    return { socket, open };
  }

  it('resolves true when the port accepts a connection', async () => {
    const { socket, open } = fakeSocket('connect');

    await expect(probePort('localhost', 5432, { open, timeout: 50 })).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith({ host: 'localhost', port: 5432 });
    expect(socket.setTimeout).toHaveBeenCalledWith(50);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it.each(['error', 'timeout'])('resolves false on %s', async (event) => {
    const { open } = fakeSocket(event);

    await expect(probePort('localhost', 5432, { open })).resolves.toBe(false);
  });

  it('uses node:net by default (closed port → false)', async () => {
    await expect(probePort('127.0.0.1', 1, { timeout: 500 })).resolves.toBe(false);
  });
});

describe('parseEnv', () => {
  it('reads KEY=value pairs, strips quotes and ignores comments and blank lines', () => {
    const env = parseEnv('# c\n\nA=1\r\nB = "two words"\nC=\'x # kept\'\nD=url # local db\nE="y" # quoted\nnot a pair\n');

    expect([...env]).toEqual([
      ['A', '1'],
      ['B', 'two words'],
      ['C', 'x # kept'],
      ['D', 'url'],
      ['E', 'y'],
    ]);
  });
});

describe('postgresContainers', () => {
  it('reads NDJSON and array output, keeping only the postgres service', () => {
    const redis = JSON.stringify({ Service: 'redis', Health: 'healthy' });

    expect(postgresContainers(`${healthy}\n${redis}\n`)).toEqual([{ Service: 'postgres', Health: 'healthy' }]);
    expect(postgresContainers(`[${healthy}]`)).toHaveLength(1);
  });

  it('is empty for empty or invalid output', () => {
    expect(postgresContainers('')).toEqual([]);
    expect(postgresContainers('no json')).toEqual([]);
  });
});

describe('checkNode', () => {
  it('passes on the minimum major version', () => {
    expect(checkNode({ nodeVersion: '22.0.0' })).toEqual({ status: 'done', detail: 'v22.0.0', warnings: [] });
  });

  it('fails below it', () => {
    expect(() => checkNode({ nodeVersion: '20.11.1' })).toThrow(StepError);
  });
});

describe('installDependencies', () => {
  it('runs npm install and writes the lockfile stamp, then skips while the lockfile is unchanged', () => {
    const run = fakeRun();

    expect(installDependencies({ root, run }).status).toBe('done');
    expect(run).toHaveBeenCalledWith('npm', ['install']);
    expect(existsSync(join(root, 'node_modules', '.devmentor-setup'))).toBe(true);

    expect(installDependencies({ root, run }).status).toBe('skipped');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stamps the lockfile as npm install left it', () => {
    const run = vi.fn(() => {
      writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"synced":true}');
      return { status: 0, stdout: '' };
    });
    installDependencies({ root, run });

    expect(installDependencies({ root, run }).status).toBe('skipped');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('reinstalls when the lockfile changed', () => {
    const run = fakeRun();
    installDependencies({ root, run });
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}');

    expect(installDependencies({ root, run }).status).toBe('done');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('fails without writing the stamp when npm install fails', () => {
    const run = fakeRun({ 'npm install': { status: 1, stdout: '' } });

    expect(() => installDependencies({ root, run })).toThrow('npm install failed');
    expect(existsSync(join(root, 'node_modules', '.devmentor-setup'))).toBe(false);
  });
});

describe('createEnv', () => {
  it('copies .env.example when .env is missing', () => {
    expect(createEnv({ root }).status).toBe('done');
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe(EXAMPLE);
  });

  it('never overwrites an existing .env and warns about missing keys', () => {
    writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://me@db/x\n');

    expect(createEnv({ root })).toEqual({
      status: 'skipped',
      detail: '.env already exists (never overwritten)',
      warnings: ['.env is missing keys from .env.example: LOG_LEVEL'],
    });
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('DATABASE_URL=postgres://me@db/x\n');
  });

  it('has no warning when every key is present', () => {
    writeFileSync(join(root, '.env'), EXAMPLE);

    expect(createEnv({ root }).warnings).toEqual([]);
  });
});

describe('startDatabase', () => {
  const probe = vi.fn(async () => false);

  beforeEach(() => {
    writeFileSync(join(root, '.env'), EXAMPLE);
    probe.mockClear();
  });

  const start = (run, env = {}) => startDatabase({ root, run, env, probePort: probe });

  it('skips Docker when .env points DATABASE_URL elsewhere', async () => {
    writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://me@db.internal:5432/devmentor\n');
    const run = fakeRun();

    await expect(start(run)).resolves.toMatchObject({ status: 'skipped' });
    expect(run).not.toHaveBeenCalled();
  });

  it('prefers DATABASE_URL from the shell environment', async () => {
    const run = fakeRun();

    await expect(start(run, { DATABASE_URL: 'postgres://me@elsewhere/db' })).resolves.toMatchObject({
      status: 'skipped',
    });
  });

  it('treats a .env without DATABASE_URL as the default', async () => {
    writeFileSync(join(root, '.env'), 'LOG_LEVEL=info\n');
    const run = fakeRun();

    await expect(start(run)).resolves.toMatchObject({ status: 'done' });
  });

  it('fails with the native-PostgreSQL hint when Docker Compose is missing and nothing listens', async () => {
    const run = fakeRun({ 'docker compose version': { status: 1, stdout: '' } });

    await expect(start(run)).rejects.toMatchObject({ message: 'Docker Compose v2 is not available' });
    expect(probe).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalledWith('docker', ['compose', 'ps', '--format', 'json', 'postgres'], {
      capture: true,
    });
  });

  it('probes when the Docker daemon is down, so a native server still counts', async () => {
    probe.mockResolvedValueOnce(true);
    const run = fakeRun({ 'docker compose ps --format json postgres': { status: 1, stdout: '' } });

    await expect(start(run)).resolves.toMatchObject({ status: 'skipped' });
    expect(probe).toHaveBeenCalledWith('localhost', 5432);
  });

  it('skips without Docker when a native PostgreSQL listens on the default port', async () => {
    probe.mockResolvedValueOnce(true);
    const run = fakeRun({ 'docker compose version': { status: 1, stdout: '' } });

    await expect(start(run)).resolves.toMatchObject({ status: 'skipped' });
  });

  it('waits for a starting container instead of probing its proxied port', async () => {
    const starting = JSON.stringify({ Service: 'postgres', Health: 'starting' });
    const run = fakeRun({ 'docker compose ps --format json postgres': { status: 0, stdout: starting } });

    await expect(start(run)).resolves.toMatchObject({ status: 'done' });
    expect(probe).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
  });

  it('skips when the postgres container is already healthy', async () => {
    const run = fakeRun({ 'docker compose ps --format json postgres': { status: 0, stdout: healthy } });

    await expect(start(run)).resolves.toMatchObject({ status: 'skipped' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('skips when another PostgreSQL already listens on the default port', async () => {
    probe.mockResolvedValueOnce(true);
    const run = fakeRun();

    await expect(start(run)).resolves.toMatchObject({
      status: 'skipped',
      detail: 'a PostgreSQL server already listens on localhost:5432',
    });
    expect(probe).toHaveBeenCalledWith('localhost', 5432);
    expect(run).not.toHaveBeenCalledWith('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
  });

  it('defaults the probe port to 5432 when the URL has none', async () => {
    writeFileSync(join(root, '.env.example'), 'DATABASE_URL=postgres://devmentor@localhost/devmentor\n');
    writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://devmentor@localhost/devmentor\n');
    probe.mockResolvedValueOnce(true);

    await expect(start(fakeRun())).resolves.toMatchObject({
      detail: 'a PostgreSQL server already listens on localhost:5432',
    });
    expect(probe).toHaveBeenCalledWith('localhost', 5432);
  });

  it('starts the container and waits for its healthcheck', async () => {
    const run = fakeRun();

    await expect(start(run)).resolves.toMatchObject({ status: 'done' });
    expect(run).toHaveBeenCalledWith('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
  });

  it('fails when docker compose cannot start postgres', async () => {
    const run = fakeRun({ 'docker compose up -d --wait postgres': { status: 1, stdout: '' } });

    await expect(start(run)).rejects.toBeInstanceOf(StepError);
  });
});

describe('runMigrations', () => {
  it('runs npm run db:migrate', () => {
    const run = fakeRun();

    expect(runMigrations({ run }).status).toBe('done');
    expect(run).toHaveBeenCalledWith('npm', ['run', 'db:migrate']);
  });

  it('fails when migrations fail', () => {
    expect(() => runMigrations({ run: fakeRun({ 'npm run db:migrate': { status: 1, stdout: '' } }) })).toThrow(
      'migrations failed',
    );
  });
});

describe('main', () => {
  const setup = (overrides = {}) => {
    const log = vi.fn();
    const logError = vi.fn();
    const run = fakeRun();
    const options = {
      root,
      run,
      env: {},
      nodeVersion: '22.11.0',
      probePort: async () => false,
      log,
      logError,
      ...overrides,
    };
    return { log, logError, run, options };
  };

  it('runs every step, prints one line per step and the next steps', async () => {
    const { log, options } = setup();

    await expect(main(options)).resolves.toBe(0);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      '✓ Node.js — v22.11.0',
      '✓ Dependencies — installed',
      '✓ .env — created from .env.example',
      '✓ PostgreSQL — postgres container started and healthy',
      '✓ Migrations — database schema up to date',
      NEXT_STEPS,
    ]);
  });

  it('reports skipped steps and warnings on a re-run', async () => {
    const { log, options } = setup();
    await main(options);
    writeFileSync(join(root, '.env'), `DATABASE_URL=${DEFAULT_URL}\n`);
    log.mockClear();

    await expect(main(options)).resolves.toBe(0);
    expect(log.mock.calls.map(([line]) => line).slice(1, 4)).toEqual([
      '↷ Dependencies — package-lock.json unchanged since the last install',
      '↷ .env — .env already exists (never overwritten)',
      '  ! .env is missing keys from .env.example: LOG_LEVEL',
    ]);
  });

  it('stops at the first failing step with its hint and exit code 1', async () => {
    const { log, logError, run, options } = setup({ nodeVersion: '20.0.0' });

    await expect(main(options)).resolves.toBe(1);
    expect(logError).toHaveBeenCalledWith('✗ Node.js — Node.js 22+ is required, found 20.0.0');
    expect(logError).toHaveBeenCalledTimes(2);
    expect(log).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    rmSync(join(root, 'package-lock.json'));
    const { options } = setup();

    await expect(main(options)).rejects.toThrow(/ENOENT/);
  });
});
