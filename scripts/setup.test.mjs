import { afterEach, describe, expect, it, vi } from 'vitest';

const main = vi.fn(async () => 1);
vi.mock('./lib/setup.mjs', () => ({ main }));

describe('npm run setup entry', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets the process exit code from main()', async () => {
    await import('./setup.mjs');

    expect(main).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
