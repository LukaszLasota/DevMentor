import { afterEach, describe, expect, it, vi } from 'vitest';

const main = vi.fn(() => 1);
vi.mock('./lib/check-tokens.mjs', () => ({ main }));

describe('npm run check:tokens entry', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets the process exit code from main()', async () => {
    await import('./check-tokens.mjs');

    expect(main).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
