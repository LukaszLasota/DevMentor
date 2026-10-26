import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { startGithubStub } from '../../../scripts/lib/github-stub.mjs';

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    postgresContainerId: string;
    githubStubUrl: string;
  }
}

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const appDir = fileURLToPath(new URL('../', import.meta.url));
const nextBin = fileURLToPath(new URL('../../../node_modules/.bin/next', import.meta.url));
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 500;
/** CI operator: the GitHub stub gives login `mock-operator` this verified email. */
const OPERATOR_EMAIL = 'mock-operator@devmentor.test';

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
 * (`npm run db:migrate`), starts the GitHub stub (`scripts/lib/github-stub.mjs`) and boots the
 * production build against both.
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

  const githubStub = await startGithubStub({ port: 0, clientId: 'integration-client', clientSecret: 'integration-secret' });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const server = spawn(nextBin, ['start', '--port', String(port), '--hostname', '127.0.0.1'], {
    cwd: appDir,
    // Production refuses to serve without SESSION_SECRET and APP_URL; each run gets a throwaway secret.
    env: {
      ...env,
      NODE_ENV: 'production',
      SESSION_SECRET: randomBytes(32).toString('hex'),
      APP_URL: baseUrl,
      // GitHub sign-in goes to the local stub; the app accepts override URLs only with ALLOW_TEST_OVERRIDES=1.
      ALLOW_TEST_OVERRIDES: '1',
      GITHUB_OAUTH_URL: githubStub.url,
      GITHUB_API_URL: githubStub.url,
      GITHUB_CLIENT_ID: 'integration-client',
      GITHUB_CLIENT_SECRET: 'integration-secret',
      OPERATOR_EMAILS: OPERATOR_EMAIL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));

  try {
    await waitForHealthy(`${baseUrl}/api/health`, server, logs);
  } catch (error) {
    server.kill();
    await githubStub.close();
    await postgres.stop();
    throw error;
  }

  project.provide('baseUrl', baseUrl);
  project.provide('postgresContainerId', postgres.getId());
  project.provide('githubStubUrl', githubStub.url);

  return async () => {
    // `DEBUG_APP_LOGS=1 npm run test:integration` prints the app's log (server errors behind a browser error page).
    if (process.env.DEBUG_APP_LOGS) console.log(logs.join(''));
    server.kill();
    await githubStub.close();
    await postgres.stop();
  };
}
