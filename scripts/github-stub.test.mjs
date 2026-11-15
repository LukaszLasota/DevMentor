import { describe, expect, it, vi } from 'vitest';

const main = vi.fn(async () => undefined);
vi.mock('./lib/github-stub.mjs', () => ({ main }));

describe('npm run github:stub entry', () => {
  it('starts the stub through main()', async () => {
    await import('./github-stub.mjs');

    expect(main).toHaveBeenCalledOnce();
  });
});
