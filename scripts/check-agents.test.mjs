import { afterEach, describe, expect, it, vi } from 'vitest';

const main = vi.fn(() => 1);
vi.mock('./lib/check-agents.mjs', () => ({ main }));

describe('npm run check:agents entry', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets the process exit code from main()', async () => {
    await import('./check-agents.mjs');

    expect(main).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
