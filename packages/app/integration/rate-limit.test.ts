import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import type { RateLimitPolicy } from '@devmentor/core';
import { psql } from './psql';

// The real RateLimiter (its parameterized upsert and purge) in this process against the migrated
// test database; psql seeds and reads the rows. `getEnv` reads process.env on first use.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';

const core = await import('@devmentor/core');
const { PasswordHasher, RateLimiter, rateLimitChecks, guardPasswordAttempt, SIGN_IN_RATE_LIMITS } = core;
const [, SIGN_IN_PER_EMAIL] = SIGN_IN_RATE_LIMITS as readonly RateLimitPolicy[];
const EMAIL = 'ada@devmentor.test';
const T0 = new Date('2026-11-14T12:00:00.000Z');
const MINUTE = 60_000;

let container: Awaited<ReturnType<typeof core.getContainer>>;

beforeAll(async () => {
  container = await core.getContainer();
});

afterAll(async () => {
  await container.cradle.orm.close();
});

afterEach(async () => {
  await psql('delete from auth_rate_limits');
});

/** One attempt in its own request scope (own forked `em`), at a fixed time. */
function consumeAt(at: Date, key: string, policy: RateLimitPolicy = SIGN_IN_PER_EMAIL): Promise<void> {
  return core.withScope(({ em, logger }) => new RateLimiter({ em, logger, clock: { now: () => at } }).consume(key, policy));
}

const [{ key }] = rateLimitChecks([SIGN_IN_PER_EMAIL], { email: EMAIL, ip: null });

describe('rate limiter against PostgreSQL', () => {
  it('counts attempts in a fixed window, refuses above the limit and resets after it', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await consumeAt(new Date(T0.getTime() + attempt * MINUTE), key);
    }

    await expect(consumeAt(new Date(T0.getTime() + 10 * MINUTE), key)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      retryAfterSeconds: 5 * 60,
    });
    expect(await psql(`select count, window_start = '${T0.toISOString()}' from auth_rate_limits where key = '${key}'`)).toBe(
      '6|t',
    );

    const next = new Date(T0.getTime() + 15 * MINUTE);
    await consumeAt(next, key);
    expect(await psql(`select count, window_start = '${next.toISOString()}' from auth_rate_limits where key = '${key}'`)).toBe(
      '1|t',
    );
  });

  it('counts every one of many concurrent attempts', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => consumeAt(T0, key)));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(await psql(`select count from auth_rate_limits where key = '${key}'`)).toBe('20');
  });

  it('deletes windows that expired under every policy and keeps the rest', async () => {
    await psql(
      "insert into auth_rate_limits (key, window_start, count) values " +
        `('sign-in:email:old', '${new Date(T0.getTime() - 61 * MINUTE).toISOString()}', 3), ` +
        `('register:email:recent', '${new Date(T0.getTime() - 30 * MINUTE).toISOString()}', 2)`,
    );

    await consumeAt(T0, key);

    expect(await psql('select key from auth_rate_limits order by key')).toBe(['register:email:recent', key].sort().join('\n'));
  });

  it('does not consume the limit when the hashing gate is saturated', async () => {
    const passwordHasher = new PasswordHasher({ concurrency: 1, waitMs: 20, params: { logN: 4, r: 8, p: 1 } });
    let release!: () => void;
    const held = passwordHasher.withSlot(() => new Promise<void>((resolve) => (release = resolve)));
    const checks = rateLimitChecks(SIGN_IN_RATE_LIMITS, { email: EMAIL, ip: '203.0.113.7' });

    const saturated = core.withScope((cradle) =>
      guardPasswordAttempt({ passwordHasher, rateLimiter: cradle.rateLimiter }, checks, async () => true),
    );

    await expect(saturated).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(await psql('select count(*) from auth_rate_limits')).toBe('0');

    release();
    await held;
    await core.withScope((cradle) =>
      guardPasswordAttempt({ passwordHasher, rateLimiter: cradle.rateLimiter }, checks, async () => true),
    );
    expect(await psql('select count(*) from auth_rate_limits')).toBe('2');
  });
});
