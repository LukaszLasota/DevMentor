import { afterEach, describe, expect, it, vi } from 'vitest';

const main = vi.fn(() => 1);
vi.mock('./lib/audit.mjs', () => ({ main }));

describe('npm run audit entry', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets the process exit code from main()', async () => {
    await import('./audit.mjs');

    expect(main).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
