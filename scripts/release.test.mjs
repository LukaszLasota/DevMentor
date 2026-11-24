import { afterEach, describe, expect, it, vi } from 'vitest';

const main = vi.fn(() => 1);
vi.mock('./lib/release.mjs', () => ({ main }));

describe('npm run release entry', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets the process exit code from main()', async () => {
    await import('./release.mjs');

    expect(main).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
