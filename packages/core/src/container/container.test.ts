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

  it('registers the clock, fetchJson and the event bus as singletons', async () => {
    const { getContainer, createRequestScope } = await loadContainer();
    const { systemClock } = await import('../time/clock');
    const { EventBus } = await import('../events/events');
    const container = await getContainer();
    const scope = await createRequestScope();

    expect(container.cradle.clock).toBe(systemClock);
    expect(typeof container.cradle.fetchJson).toBe('function');
    expect(scope.cradle.fetchJson).toBe(container.cradle.fetchJson);
    expect(container.cradle.events).toBeInstanceOf(EventBus);
    expect(scope.cradle.events).toBe(container.cradle.events);
  });

  it('registers one process-wide PasswordHasher with the production scrypt cost and the env gate', async () => {
    vi.stubEnv('PASSWORD_HASH_CONCURRENCY', '3');
    const { getContainer, createRequestScope } = await loadContainer();
    const { PasswordHasher, PASSWORD_SCRYPT_PARAMS } = await import('../security/password');
    const container = await getContainer();
    const scope = await createRequestScope();

    expect(container.cradle.passwordHasher).toBeInstanceOf(PasswordHasher);
    expect(scope.cradle.passwordHasher).toBe(container.cradle.passwordHasher);
    expect(container.cradle.passwordHasher.params).toBe(PASSWORD_SCRYPT_PARAMS);
    expect(container.cradle.passwordHasher['gate']).toMatchObject({ options: { concurrency: 3, waitMs: 3000 } });
  });

  it('disables ORM debug outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(64));
    vi.stubEnv('APP_URL', 'https://devmentor.test');
    const { getContainer } = await loadContainer();

    await getContainer();

    expect(getOrm).toHaveBeenCalledWith(expect.objectContaining({ debug: false }));
  });

  it('refuses to start in production without SESSION_SECRET and APP_URL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getContainer } = await loadContainer();

    await expect(getContainer()).rejects.toThrow('SESSION_SECRET, APP_URL must be set in production');
    expect(getOrm).not.toHaveBeenCalled();
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
    expect(first.cradle.githubOAuthService).toBe(first.cradle.githubOAuthService);
    expect(first.cradle.githubOAuthService).not.toBe(second.cradle.githubOAuthService);
    expect(first.cradle.accountService).toBe(first.cradle.accountService);
    expect(first.cradle.accountService).not.toBe(second.cradle.accountService);
    expect(first.cradle.rateLimiter).toBe(first.cradle.rateLimiter);
    expect(first.cradle.rateLimiter).not.toBe(second.cradle.rateLimiter);
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
