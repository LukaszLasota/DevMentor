import { beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn(async (config: unknown) => ({ config }));

vi.mock('@mikro-orm/postgresql', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mikro-orm/postgresql')>()),
  MikroORM: { init },
}));

const options = { clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 2 }, debug: false };

describe('getOrm', () => {
  beforeEach(() => {
    init.mockClear();
    (globalThis as { devmentorOrm?: unknown }).devmentorOrm = undefined;
  });

  it('initialises MikroORM once per process and reuses the instance', async () => {
    const { getOrm } = await import('./orm');

    const first = await getOrm(options);
    const second = await getOrm({ ...options, clientUrl: 'postgres://ignored' });

    expect(second).toBe(first);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ clientUrl: options.clientUrl }));
  });
});
