import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    postgresContainerId: string;
  }
}

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const appDir = fileURLToPath(new URL('../', import.meta.url));
const nextBin = fileURLToPath(new URL('../../../node_modules/.bin/next', import.meta.url));
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 500;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No port'))));
    });
  });
}

async function waitForHealthy(url: string, server: ChildProcess, logs: string[]): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited with ${server.exitCode}:\n${logs.join('')}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not listening yet; poll again.
    }

    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }

  throw new Error(`App did not become healthy at ${url} within ${HEALTH_TIMEOUT_MS} ms:\n${logs.join('')}`);
}

/**
 * Starts PostgreSQL in Docker, applies the committed migrations with the real CLI
 * (`npm run db:migrate`) and boots the production build against it.
 */
export default async function setup(project: TestProject) {
  if (!existsSync(`${appDir}.next/BUILD_ID`)) {
    throw new Error('No production build found — run `npm run build` first (npm run test:integration does).');
  }

  const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('devmentor')
    .withUsername('devmentor')
    .withPassword('devmentor')
    .start();
  const env = { ...process.env, DATABASE_URL: postgres.getConnectionUri(), LOG_LEVEL: 'warn' };

  await execFileAsync('npm', ['run', 'db:migrate'], { cwd: repoRoot, env });

  const port = await freePort();
  const logs: string[] = [];
  const server = spawn(nextBin, ['start', '--port', String(port), '--hostname', '127.0.0.1'], {
    cwd: appDir,
    env: { ...env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealthy(`${baseUrl}/api/health`, server, logs);
  } catch (error) {
    server.kill();
    await postgres.stop();
    throw error;
  }

  project.provide('baseUrl', baseUrl);
  project.provide('postgresContainerId', postgres.getId());

  return async () => {
    server.kill();
    await postgres.stop();
  };
}
