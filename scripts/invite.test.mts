import { afterEach, describe, expect, it, vi } from 'vitest';

const runInviteCli = vi.fn(async () => 1);
vi.mock('@devmentor/core/cli', () => ({ runInviteCli }));

const argv = process.argv;

afterEach(() => {
  process.exitCode = undefined;
  process.argv = argv;
});

describe('npm run invite entry', () => {
  it('passes the arguments after the script and exits with the CLI code', async () => {
    process.argv = ['node', 'scripts/invite.mts', 'list', '--batch', 'b1'];

    await import('./invite.mts');

    expect(runInviteCli).toHaveBeenCalledWith({ argv: ['list', '--batch', 'b1'], stdout: console.log, stderr: console.error });
    expect(process.exitCode).toBe(1);
  });
});
