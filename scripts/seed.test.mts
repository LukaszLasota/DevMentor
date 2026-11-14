import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubIdFor } from './lib/github-stub.mjs';

const runSeedCli = vi.fn(async () => 1);
vi.mock('@devmentor/core/cli', () => ({ runSeedCli }));

afterEach(() => {
  process.exitCode = undefined;
});

describe('npm run db:seed entry', () => {
  it('runs the seed with its arguments and the stub GitHub ids and exits with its code', async () => {
    await import('./seed.mts');

    expect(runSeedCli).toHaveBeenCalledWith({
      argv: process.argv.slice(2),
      githubIdFor,
      stdout: console.log,
      stderr: console.error,
    });
    expect(process.exitCode).toBe(1);
  });
});
