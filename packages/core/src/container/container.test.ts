import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const orm = { em: { fork: vi.fn(() => ({ forked: true })) } };
const getOrm = vi.fn(async () => orm);

vi.mock('@devmentor/db', () => ({ getOrm }));

const ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  DATABASE_POOL_MIN: '1',
  DATABASE_POOL_MAX: '4',
  NODE_ENV: 'development',
};

async function loadContainer() {
  vi.resetModules();
  return import('./container');
}

describe('DI container', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    getOrm.mockClear();
    orm.em.fork.mockClear();
    (globalThis as { devmentorContainer?: unknown }).devmentorContainer = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('initialises the ORM from the validated env and caches the container', async () => {
    const { getContainer } = await loadContainer();

    const container = await getContainer();

    expect(await getContainer()).toBe(container);
    expect(getOrm).toHaveBeenCalledTimes(1);
    expect(getOrm).toHaveBeenCalledWith({
      clientUrl: ENV.DATABASE_URL,
      pool: { min: 1, max: 4 },
      debug: true,
    });
    expect(container.cradle.orm).toBe(orm);
    expect(container.cradle.env.DATABASE_URL).toBe(ENV.DATABASE_URL);
    expect(typeof container.cradle.logger.info).toBe('function');
  });

  it('disables ORM debug outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getContainer } = await loadContainer();

    await getContainer();

    expect(getOrm).toHaveBeenCalledWith(expect.objectContaining({ debug: false }));
  });

  it('does not cache a failed build, so the next call retries', async () => {
    const { getContainer } = await loadContainer();
    getOrm.mockRejectedValueOnce(new Error('init failed'));

    await expect(getContainer()).rejects.toThrow('init failed');
    await expect(getContainer()).resolves.toBeDefined();
    expect(getOrm).toHaveBeenCalledTimes(2);
  });

  it('gives each request scope its own forked EntityManager and scoped services', async () => {
    const { createRequestScope } = await loadContainer();

    const first = await createRequestScope();
    const second = await createRequestScope();

    expect(first.cradle.em).toBe(first.cradle.em);
    expect(first.cradle.em).not.toBe(second.cradle.em);
    expect(orm.em.fork).toHaveBeenCalledTimes(2);
    expect(first.cradle.healthService).not.toBe(second.cradle.healthService);
  });

  it('withScope runs the callback with the scoped cradle and disposes the scope', async () => {
    const { withScope } = await loadContainer();

    const result = await withScope(async (cradle) => cradle.em);

    expect(result).toEqual({ forked: true });
  });

  it('withScope disposes the scope even when the callback throws', async () => {
    const { withScope, getContainer } = await loadContainer();
    const container = await getContainer();
    const dispose = vi.fn(async () => undefined);
    const createScope = vi.spyOn(container, 'createScope').mockReturnValue({
      cradle: {},
      dispose,
    } as unknown as ReturnType<typeof container.createScope>);

    await expect(
      withScope(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(dispose).toHaveBeenCalled();
    createScope.mockRestore();
  });
});
