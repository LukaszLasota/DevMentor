import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../container/cradle';
import { isTooManyRequestsError, ServiceUnavailableError, TooManyRequestsError } from '../http/errors';
import type { Logger } from '../logger';
import { PasswordHasher } from './password';
import {
  clientIp,
  CONSUME_RATE_LIMIT_SQL,
  guardPasswordAttempt,
  PURGE_RATE_LIMITS_SQL,
  RATE_LIMIT_RETENTION_MS,
  RateLimiter,
  rateLimitChecks,
  rateLimitKey,
  REGISTER_PER_EMAIL,
  REGISTER_PER_IP,
  REGISTER_RATE_LIMITS,
  RESEND_PER_EMAIL,
  RESEND_RATE_LIMITS,
  SIGN_IN_PER_EMAIL,
  SIGN_IN_PER_IP,
  SIGN_IN_RATE_LIMITS,
  type RateLimitPolicy,
} from './rate-limit';
import { hashToken } from './token';

const MINUTE = 60_000;
const T0 = new Date('2026-11-14T12:00:00.000Z');

/**
 * In-memory stand-in for `auth_rate_limits`: interprets the two statements by their parameters with
 * the same semantics as the SQL (the SQL itself runs against PostgreSQL in
 * `packages/app/integration/rate-limit.test.ts`).
 */
function fakeEm() {
  const rows = new Map<string, { windowStart: Date; count: number }>();
  const execute = vi.fn(async (sql: string, params: string[]) => {
    if (sql === CONSUME_RATE_LIMIT_SQL) {
      const [key, now, cutoff] = params;
      const row = rows.get(key);
      const next =
        row === undefined || row.windowStart <= new Date(cutoff)
          ? { windowStart: new Date(now), count: 1 }
          : { windowStart: row.windowStart, count: row.count + 1 };
      rows.set(key, next);

      return [{ window_start: next.windowStart, count: next.count }];
    }

    for (const [key, row] of rows) {
      if (row.windowStart <= new Date(params[0])) rows.delete(key);
    }

    return { affectedRows: 0 };
  });

  return { rows, execute, em: { execute } as unknown as Cradle['em'] };
}

function fakeLogger() {
  return { warn: vi.fn() } as unknown as Logger & { warn: ReturnType<typeof vi.fn> };
}

function setup() {
  const db = fakeEm();
  const clock = { now: vi.fn(() => T0) };
  const logger = fakeLogger();
  const limiter = new RateLimiter({ em: db.em, clock, logger });

  return { ...db, clock, logger, limiter, at: (ms: number) => clock.now.mockReturnValue(new Date(T0.getTime() + ms)) };
}

const FIVE_PER_15_MIN: RateLimitPolicy = SIGN_IN_PER_EMAIL;

describe('policies', () => {
  it('match the spec: sign-in 10/15 min per IP + 5/15 min per email; register 5/h per IP + 3/h per email; resend 3/h per email', () => {
    expect(SIGN_IN_PER_IP).toEqual({ action: 'sign-in', subject: 'ip', limit: 10, windowMs: 15 * MINUTE });
    expect(SIGN_IN_PER_EMAIL).toEqual({ action: 'sign-in', subject: 'email', limit: 5, windowMs: 15 * MINUTE });
    expect(REGISTER_PER_IP).toEqual({ action: 'register', subject: 'ip', limit: 5, windowMs: 60 * MINUTE });
    expect(REGISTER_PER_EMAIL).toEqual({ action: 'register', subject: 'email', limit: 3, windowMs: 60 * MINUTE });
    expect(RESEND_PER_EMAIL).toEqual({ action: 'resend', subject: 'email', limit: 3, windowMs: 60 * MINUTE });
    expect(SIGN_IN_RATE_LIMITS).toEqual([SIGN_IN_PER_IP, SIGN_IN_PER_EMAIL]);
    expect(REGISTER_RATE_LIMITS).toEqual([REGISTER_PER_IP, REGISTER_PER_EMAIL]);
    expect(RESEND_RATE_LIMITS).toEqual([RESEND_PER_EMAIL]);
  });

  it('keep rows for the longest window (1 h)', () => {
    expect(RATE_LIMIT_RETENTION_MS).toBe(60 * MINUTE);
  });
});

describe('rateLimitKey / rateLimitChecks', () => {
  it('builds <action>:<subject>:<sha256hex> of the trimmed, lower-cased value', () => {
    const key = rateLimitKey(SIGN_IN_PER_EMAIL, ' Ada@DevMentor.test ');

    expect(key).toBe(`sign-in:email:${hashToken('ada@devmentor.test')}`);
    expect(key).toMatch(/^sign-in:email:[0-9a-f]{64}$/);
    expect(rateLimitKey(REGISTER_PER_IP, '2001:DB8::1')).toBe(`register:ip:${hashToken('2001:db8::1')}`);
  });

  it('gives one check per policy, skipping per-IP ones without a client IP', () => {
    const email = 'ada@devmentor.test';

    expect(rateLimitChecks(SIGN_IN_RATE_LIMITS, { email, ip: '203.0.113.7' })).toEqual([
      { key: rateLimitKey(SIGN_IN_PER_IP, '203.0.113.7'), policy: SIGN_IN_PER_IP },
      { key: rateLimitKey(SIGN_IN_PER_EMAIL, email), policy: SIGN_IN_PER_EMAIL },
    ]);
    expect(rateLimitChecks(SIGN_IN_RATE_LIMITS, { email, ip: null })).toEqual([
      { key: rateLimitKey(SIGN_IN_PER_EMAIL, email), policy: SIGN_IN_PER_EMAIL },
    ]);
  });
});

describe('clientIp', () => {
  async function freshClientIp() {
    vi.resetModules();
    return (await import('./rate-limit')).clientIp;
  }

  const headers = (xff?: string) => new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff });

  it.each([
    [1, '198.51.100.1, 203.0.113.7', '203.0.113.7'],
    [2, '198.51.100.1, 203.0.113.7, 10.0.0.2', '203.0.113.7'],
    [1, ' 2001:db8::1 ', '2001:db8::1'],
  ])('trusts %i hop(s): %s → %s', (hops, xff, ip) => {
    expect(clientIp(headers(xff), hops, fakeLogger())).toBe(ip);
  });

  it('derives no IP with 0 hops and warns once per process', async () => {
    const fresh = await freshClientIp();
    const logger = fakeLogger();

    expect(fresh(headers('203.0.113.7'), 0, logger)).toBeNull();
    expect(fresh(headers('203.0.113.7'), 0, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { trustedProxyHops: 0 },
      expect.stringContaining('per-IP rate limits are skipped'),
    );
  });

  it.each([
    ['no header', undefined, 1],
    ['fewer entries than hops', '203.0.113.7', 2],
    ['a malformed entry', '203.0.113.7, not-an-ip', 1],
    ['an empty entry', '203.0.113.7, ', 1],
  ])('derives no IP from %s', async (_case, xff, hops) => {
    const fresh = await freshClientIp();
    const logger = fakeLogger();

    expect(fresh(headers(xff), hops, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('RateLimiter.consume', () => {
  const key = rateLimitKey(FIVE_PER_15_MIN, 'ada@devmentor.test');

  it('runs the parameterized upsert, then purges windows older than the retention', async () => {
    const { limiter, execute } = setup();

    await limiter.consume(key, FIVE_PER_15_MIN);

    expect(execute).toHaveBeenNthCalledWith(1, CONSUME_RATE_LIMIT_SQL, [
      key,
      '2026-11-14T12:00:00.000Z',
      '2026-11-14T11:45:00.000Z',
      '2026-11-14T11:45:00.000Z',
    ]);
    expect(execute).toHaveBeenNthCalledWith(2, PURGE_RATE_LIMITS_SQL, ['2026-11-14T11:00:00.000Z']);
  });

  it('allows `limit` attempts per window, then throws 429 with the seconds left', async () => {
    const { limiter, at, logger } = setup();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      at(attempt * MINUTE);
      await limiter.consume(key, FIVE_PER_15_MIN);
    }

    at(10 * MINUTE + 500);
    const error = await limiter.consume(key, FIVE_PER_15_MIN).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(isTooManyRequestsError(error) && error.retryAfterSeconds).toBe(5 * 60);
    expect(logger.warn).toHaveBeenCalledWith(
      { action: 'sign-in', subject: 'email', retryAfterSeconds: 300 },
      'Rate limit exceeded',
    );
  });

  it('keeps counting refused attempts and never answers less than 1 second', async () => {
    const { limiter, at, rows } = setup();

    for (let attempt = 0; attempt < 7; attempt += 1) {
      await limiter.consume(key, FIVE_PER_15_MIN).catch(() => undefined);
    }
    expect(rows.get(key)?.count).toBe(7);

    at(15 * MINUTE - 200);
    await expect(limiter.consume(key, FIVE_PER_15_MIN)).rejects.toMatchObject({ retryAfterSeconds: 1 });
  });

  it('starts a new window once the old one has passed', async () => {
    const { limiter, at, rows } = setup();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await limiter.consume(key, FIVE_PER_15_MIN).catch(() => undefined);
    }

    at(15 * MINUTE);
    await expect(limiter.consume(key, FIVE_PER_15_MIN)).resolves.toBeUndefined();
    expect(rows.get(key)).toEqual({ windowStart: new Date(T0.getTime() + 15 * MINUTE), count: 1 });
  });

  it('counts keys separately and drops rows of expired windows', async () => {
    const { limiter, at, rows } = setup();
    const other = rateLimitKey(REGISTER_PER_EMAIL, 'ada@devmentor.test');

    await limiter.consume(key, FIVE_PER_15_MIN);
    await limiter.consume(other, REGISTER_PER_EMAIL);
    expect([...rows.keys()]).toEqual([key, other]);

    at(60 * MINUTE);
    await limiter.consume(rateLimitKey(RESEND_PER_EMAIL, 'bob@devmentor.test'), RESEND_PER_EMAIL);
    expect(rows.has(key)).toBe(false);
    expect(rows.has(other)).toBe(false);
  });

  it('refuses a policy whose window outlives the retention (its rows would be purged early)', async () => {
    const { limiter, execute } = setup();
    const daily: RateLimitPolicy = { action: 'sign-in', subject: 'email', limit: 1, windowMs: 24 * 60 * MINUTE };

    await expect(limiter.consume(key, daily)).rejects.toThrow('exceeds RATE_LIMIT_RETENTION_MS');
    expect(execute).not.toHaveBeenCalled();
  });

  it('accepts window_start as a string from the driver', async () => {
    const execute = vi.fn(async () => [{ window_start: '2026-11-14T11:50:00.000Z', count: 6 }]);
    const limiter = new RateLimiter({
      em: { execute } as unknown as Cradle['em'],
      clock: { now: () => T0 },
      logger: fakeLogger(),
    });

    await expect(limiter.consume(key, FIVE_PER_15_MIN)).rejects.toMatchObject({ retryAfterSeconds: 5 * 60 });
  });
});

describe('RateLimiter.consumeAll', () => {
  it('consumes every check in order and stops at the first one over its limit', async () => {
    const { limiter, rows } = setup();
    const checks = rateLimitChecks(RESEND_RATE_LIMITS, { email: 'ada@devmentor.test', ip: null });
    const both = [...rateLimitChecks(REGISTER_RATE_LIMITS, { email: 'ada@devmentor.test', ip: '203.0.113.7' })];

    await limiter.consumeAll(both);
    expect(rows.size).toBe(2);

    for (let attempt = 0; attempt < 3; attempt += 1) await limiter.consumeAll(checks);
    await expect(limiter.consumeAll([...checks, both[0]])).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(rows.get(both[0].key)?.count).toBe(1);
  });
});

describe('guardPasswordAttempt (gate slot → consume → hash)', () => {
  const FAST = { logN: 4, r: 8, p: 1 };
  let order: string[];

  beforeEach(() => {
    order = [];
  });

  function deps(hasher: PasswordHasher, consumeAll: (checks: unknown) => Promise<void>) {
    return { passwordHasher: hasher, rateLimiter: { consumeAll } as unknown as RateLimiter };
  }

  it('takes the slot, consumes the limits, then runs the hashing work', async () => {
    const hasher = new PasswordHasher({ concurrency: 1, waitMs: 0, params: FAST });
    const checks = rateLimitChecks(SIGN_IN_RATE_LIMITS, { email: 'ada@devmentor.test', ip: null });
    const consumeAll = vi.fn(async () => {
      order.push(`consume (slots in use: ${hasher['gate']['active']})`);
    });

    const result = await guardPasswordAttempt(deps(hasher, consumeAll), checks, async ({ verify }) => {
      order.push('hash');
      return verify('anything', null);
    });

    expect(result).toBe(false);
    expect(consumeAll).toHaveBeenCalledWith(checks);
    expect(order).toEqual(['consume (slots in use: 1)', 'hash']);
  });

  it('answers 503 on a saturated gate without consuming the limit', async () => {
    const hasher = new PasswordHasher({ concurrency: 1, waitMs: 5, params: FAST });
    let release!: () => void;
    const held = hasher.withSlot(() => new Promise<void>((resolve) => (release = resolve)));
    const consumeAll = vi.fn(async () => undefined);
    const work = vi.fn(async () => true);

    await expect(guardPasswordAttempt(deps(hasher, consumeAll), [], work)).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(consumeAll).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();

    release();
    await held;
  });

  it('never hashes a limited attempt and frees the slot', async () => {
    const hasher = new PasswordHasher({ concurrency: 1, waitMs: 0, params: FAST });
    const work = vi.fn(async () => true);
    const limited = vi.fn(async () => Promise.reject(new TooManyRequestsError(60)));

    await expect(guardPasswordAttempt(deps(hasher, limited), [], work)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(work).not.toHaveBeenCalled();
    await expect(hasher.withSlot(async () => 'free')).resolves.toBe('free');
  });
});
