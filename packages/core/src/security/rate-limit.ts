import { isIP } from 'node:net';
import type { Cradle } from '../container/cradle';
import { TooManyRequestsError } from '../http/errors';
import type { Logger } from '../logger';
import type { PasswordHasher, SlotHashing } from './password';
import { hashToken } from './token';

/** What a limit counts per: the lower-cased email or the client IP (both hashed in the key). */
export type RateLimitSubject = 'email' | 'ip';

/** A fixed-window limit: at most `limit` attempts per `windowMs` for one action and subject. */
export interface RateLimitPolicy {
  readonly action: 'sign-in' | 'register' | 'resend' | 'booking-start' | 'booking-change';
  readonly subject: RateLimitSubject;
  readonly limit: number;
  readonly windowMs: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const SIGN_IN_PER_IP: RateLimitPolicy = { action: 'sign-in', subject: 'ip', limit: 10, windowMs: 15 * MINUTE_MS };
export const SIGN_IN_PER_EMAIL: RateLimitPolicy = { action: 'sign-in', subject: 'email', limit: 5, windowMs: 15 * MINUTE_MS };
export const REGISTER_PER_IP: RateLimitPolicy = { action: 'register', subject: 'ip', limit: 5, windowMs: HOUR_MS };
export const REGISTER_PER_EMAIL: RateLimitPolicy = { action: 'register', subject: 'email', limit: 3, windowMs: HOUR_MS };
export const RESEND_PER_EMAIL: RateLimitPolicy = { action: 'resend', subject: 'email', limit: 3, windowMs: HOUR_MS };
/** Booking starts per account (each opens a Stripe Checkout Session and holds a time). */
export const BOOKING_START_PER_EMAIL: RateLimitPolicy = { action: 'booking-start', subject: 'email', limit: 20, windowMs: HOUR_MS };
/** Booking starts per client IP: many throwaway accounts on one machine cannot hold every time (T-11); above the per-account limit for shared NATs. */
export const BOOKING_START_PER_IP: RateLimitPolicy = { action: 'booking-start', subject: 'ip', limit: 30, windowMs: HOUR_MS };
/** Releases and cancellations per account (each may call Stripe). */
export const BOOKING_CHANGE_PER_EMAIL: RateLimitPolicy = { action: 'booking-change', subject: 'email', limit: 20, windowMs: HOUR_MS };

/** The limits of each rate-limited endpoint, per IP first. */
export const SIGN_IN_RATE_LIMITS = [SIGN_IN_PER_IP, SIGN_IN_PER_EMAIL] as const;
export const REGISTER_RATE_LIMITS = [REGISTER_PER_IP, REGISTER_PER_EMAIL] as const;
export const RESEND_RATE_LIMITS = [RESEND_PER_EMAIL] as const;
export const BOOKING_START_RATE_LIMITS = [BOOKING_START_PER_IP, BOOKING_START_PER_EMAIL] as const;
export const BOOKING_CHANGE_RATE_LIMITS = [BOOKING_CHANGE_PER_EMAIL] as const;

/**
 * Rows whose window started this long ago are expired under every policy and are deleted on each
 * call. Every policy's window must fit in it (checked by `consume`).
 */
export const RATE_LIMIT_RETENTION_MS = Math.max(
  ...[...SIGN_IN_RATE_LIMITS, ...REGISTER_RATE_LIMITS, ...RESEND_RATE_LIMITS, ...BOOKING_START_RATE_LIMITS, ...BOOKING_CHANGE_RATE_LIMITS].map(
    (policy) => policy.windowMs,
  ),
);

/** `<action>:<email|ip>:<sha256hex>` — the email or IP is lower-cased and hashed, so no PII is stored. */
export function rateLimitKey(policy: RateLimitPolicy, value: string): string {
  return `${policy.action}:${policy.subject}:${hashToken(value.trim().toLowerCase())}`;
}

export interface RateLimitCheck {
  readonly key: string;
  readonly policy: RateLimitPolicy;
}

/** One check per policy; per-IP policies are skipped when no client IP is known (`clientIp` → null). */
export function rateLimitChecks(
  policies: readonly RateLimitPolicy[],
  subjects: { email: string; ip: string | null },
): RateLimitCheck[] {
  return policies.flatMap((policy) => {
    const value = policy.subject === 'email' ? subjects.email : subjects.ip;

    return value === null ? [] : [{ key: rateLimitKey(policy, value), policy }];
  });
}

let warnedNoClientIp = false;

/**
 * Client IP: the `trustedProxyHops`-th entry from the right of `x-forwarded-for` (each trusted proxy
 * appends the address it received the request from; entries further left are client-controlled).
 * `null` when none is derivable — 0 hops (the default), a shorter header or a malformed entry — and
 * then one warning per process, since per-IP limits are off.
 */
export function clientIp(headers: Headers, trustedProxyHops: number, logger: Logger): string | null {
  const entries = (headers.get('x-forwarded-for') ?? '').split(',').map((entry) => entry.trim());
  const candidate = trustedProxyHops > 0 ? entries.at(-trustedProxyHops) : undefined;

  if (candidate !== undefined && isIP(candidate) !== 0) {
    return candidate;
  }

  if (!warnedNoClientIp) {
    warnedNoClientIp = true;
    logger.warn(
      { trustedProxyHops },
      'No client IP derivable from x-forwarded-for (check TRUSTED_PROXY_HOPS); per-IP rate limits are skipped',
    );
  }

  return null;
}

/**
 * Fixed window in one statement: a new key starts a window with count 1; an expired window
 * (`window_start <= now - windowMs`) restarts; otherwise the count goes up. `ON CONFLICT` takes a row
 * lock, so concurrent attempts are all counted. Placeholders only — MikroORM escapes every value.
 * Params: key, now, window cutoff, window cutoff.
 */
export const CONSUME_RATE_LIMIT_SQL = `insert into auth_rate_limits as l (key, window_start, count)
values (?, ?::timestamptz, 1)
on conflict (key) do update set
  window_start = case when l.window_start <= ?::timestamptz then excluded.window_start else l.window_start end,
  count = case when l.window_start <= ?::timestamptz then 1 else l.count + 1 end
returning window_start, count`;

/**
 * Deletes windows expired under every policy. A separate statement after the upsert, skipping rows
 * other requests hold, so it never waits on (or deadlocks with) a concurrent attempt.
 * Param: retention cutoff.
 */
export const PURGE_RATE_LIMITS_SQL = `delete from auth_rate_limits where key in (
  select key from auth_rate_limits where window_start <= ?::timestamptz for update skip locked
)`;

interface WindowRow {
  window_start: Date | string;
  count: number;
}

/**
 * PostgreSQL fixed-window rate limiter (`auth_rate_limits`), shared by every instance and restart.
 * Every attempt counts and is never decremented. Scoped: uses the request's `em`.
 */
export class RateLimiter {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly logger: Cradle['logger'];

  constructor({ em, clock, logger }: Pick<Cradle, 'em' | 'clock' | 'logger'>) {
    this.em = em;
    this.clock = clock;
    this.logger = logger;
  }

  /** Counts one attempt; throws `TooManyRequestsError` (429 + `Retry-After`) above the limit. */
  async consume(key: string, policy: RateLimitPolicy): Promise<void> {
    if (policy.windowMs > RATE_LIMIT_RETENTION_MS) {
      throw new Error(`Rate limit window of ${policy.action} exceeds RATE_LIMIT_RETENTION_MS`);
    }

    const now = this.clock.now();
    const windowCutoff = new Date(now.getTime() - policy.windowMs).toISOString();
    const [row] = await this.em.execute<WindowRow[]>(CONSUME_RATE_LIMIT_SQL, [
      key,
      now.toISOString(),
      windowCutoff,
      windowCutoff,
    ]);
    await this.em.execute(PURGE_RATE_LIMITS_SQL, [new Date(now.getTime() - RATE_LIMIT_RETENTION_MS).toISOString()]);

    if (row.count > policy.limit) {
      const resetAt = new Date(row.window_start).getTime() + policy.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));

      this.logger.warn({ action: policy.action, subject: policy.subject, retryAfterSeconds }, 'Rate limit exceeded');
      throw new TooManyRequestsError(retryAfterSeconds);
    }
  }

  /** Consumes every check in order; the first one over its limit throws. */
  async consumeAll(checks: readonly RateLimitCheck[]): Promise<void> {
    for (const { key, policy } of checks) {
      await this.consume(key, policy);
    }
  }
}

/**
 * The order every password route follows: take a hashing gate slot → consume the rate limits → hash.
 * A saturated gate answers 503 before anything is counted; a limited attempt never reaches scrypt.
 */
export function guardPasswordAttempt<T>(
  { passwordHasher, rateLimiter }: { passwordHasher: PasswordHasher; rateLimiter: RateLimiter },
  checks: readonly RateLimitCheck[],
  work: (hashing: SlotHashing) => Promise<T>,
): Promise<T> {
  return passwordHasher.withSlot(async (hashing) => {
    await rateLimiter.consumeAll(checks);

    return work(hashing);
  });
}
