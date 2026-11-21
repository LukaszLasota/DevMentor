import { z } from 'zod';

export const DEFAULT_GITHUB_OAUTH_URL = 'https://github.com';
export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
export const DEFAULT_STRIPE_API_URL = 'https://api.stripe.com';

/** Dotenv files turn `KEY=` into an empty string; treat it as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const hexSecret = z
  .string()
  .regex(/^[0-9a-f]{64,}$/i, 'must be at least 64 hex characters (generate with `openssl rand -hex 32`)');

/** Absolute http(s) URL without a trailing slash, so callers can append paths. */
const baseUrl = z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, ''));

const operatorEmails = z
  .string()
  .default('')
  .transform((list) =>
    list
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ''),
  )
  .pipe(z.array(z.email('must be a comma-separated list of email addresses')));

/** R12/D15: the platform keeps 20% of a paid session unless the operator sets `PLATFORM_FEE_BPS`. */
export const DEFAULT_PLATFORM_FEE_BPS = 2000;

/** Defaults of the hashing gate (`core/src/security/password.ts`): scrypt slots and the wait for one. */
export const DEFAULT_PASSWORD_HASH_CONCURRENCY = 2;
export const DEFAULT_PASSWORD_HASH_WAIT_MS = 3_000;

/** Mentor invitations (invitations spec): how long a link is valid, and the publish-by window after acceptance. */
export const DEFAULT_INVITATION_TTL_DAYS = 14;
export const DEFAULT_MENTOR_PUBLISH_WINDOW_DAYS = 14;

/** A whole number of days, at least 1 and at most a year; empty → `fallback`. */
const days = (fallback: number) =>
  optional(z.coerce.number().int().min(1).max(365)).transform((value) => value ?? fallback);

const TEST_OVERRIDE_KEYS = ['DEVMENTOR_GITHUB_OAUTH_URL', 'DEVMENTOR_GITHUB_API_URL', 'STRIPE_API_URL'] as const;

/** Stored prices are Postgres `integer` (spec 2026-10-21-mentor-prices). */
export const MAX_PRICE_CENTS = 2_147_483_647;

const cents = z.number().int('must be whole cents').positive('must be above 0').max(MAX_PRICE_CENTS, `must be at most ${MAX_PRICE_CENTS}`);
const priceBounds = z
  .object({ minCents: cents, maxCents: cents })
  .strict()
  .refine((bounds) => bounds.minCents <= bounds.maxCents, 'minCents must not exceed maxCents');

/** `{"25":{"minCents":n,"maxCents":n},"50":{...}}` — both session lengths, validated together. */
const platformPriceBounds = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be JSON' });
      return z.NEVER;
    }
  })
  .pipe(z.object({ '25': priceBounds, '50': priceBounds }).strict());

/** An ISO 4217 code with exactly two decimals (the money module works in hundredths). */
export function isTwoDecimalCurrency(code: string): boolean {
  return (
    /^[A-Z]{3}$/.test(code) &&
    Intl.supportedValuesOf('currency').includes(code) &&
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits === 2
  );
}

export const MAIL_PROVIDERS = ['resend', 'log'] as const;

export type MailProvider = (typeof MAIL_PROVIDERS)[number];

/**
 * Tiers (platform-primitives spec, "API Contracts"):
 * - optional, checked at the route: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, MAIL_API_KEY, MAIL_FROM,
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (payments are unavailable without them);
 * - required at first container creation in production (see `assertProductionEnv`), never here,
 *   so `npm run build` with no env passes: SESSION_SECRET, APP_URL, and MAIL_API_KEY + MAIL_FROM
 *   for the `resend` mailer;
 * - optional, read at request time by PlatformSettingsService (no defaults; missing = prices fail
 *   closed): PLATFORM_CURRENCY, PLATFORM_PRICE_BOUNDS;
 * - dangerous configuration refused at boot: override URLs without ALLOW_TEST_OVERRIDES=1,
 *   MAIL_PROVIDER=log in production without ALLOW_TEST_OVERRIDES=1 (mail would only be logged), and a
 *   malformed or half-set PLATFORM_CURRENCY / PLATFORM_PRICE_BOUNDS pair;
 * - defaulted: SESSION_SECRET_PREVIOUS, OPERATOR_EMAILS, DEVMENTOR_GITHUB_OAUTH_URL, DEVMENTOR_GITHUB_API_URL, STRIPE_API_URL,
 *   TRUSTED_PROXY_HOPS (0: no client IP is trusted), PASSWORD_HASH_CONCURRENCY, PASSWORD_HASH_WAIT_MS,
 *   MAIL_PROVIDER (`log` in development and test, `resend` in production), INVITATION_TTL_DAYS,
 *   MENTOR_PUBLISH_WINDOW_DAYS (14 each), PLATFORM_FEE_BPS (2000 = 20%).
 */
const envShape = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL'),
    DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(0),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
    SESSION_SECRET: optional(hexSecret),
    SESSION_SECRET_PREVIOUS: optional(hexSecret),
    APP_URL: optional(baseUrl),
    GITHUB_CLIENT_ID: optional(z.string()),
    GITHUB_CLIENT_SECRET: optional(z.string()),
    DEVMENTOR_GITHUB_OAUTH_URL: optional(baseUrl),
    DEVMENTOR_GITHUB_API_URL: optional(baseUrl),
    OPERATOR_EMAILS: operatorEmails,
    /** Proxies in front of the app that append to `x-forwarded-for`; 0 = no client IP is derivable. */
    TRUSTED_PROXY_HOPS: optional(z.coerce.number().int().min(0).max(10)).transform((hops) => hops ?? 0),
    PASSWORD_HASH_CONCURRENCY: optional(z.coerce.number().int().min(1).max(64)).transform(
      (slots) => slots ?? DEFAULT_PASSWORD_HASH_CONCURRENCY,
    ),
    PASSWORD_HASH_WAIT_MS: optional(z.coerce.number().int().min(0).max(60_000)).transform(
      (ms) => ms ?? DEFAULT_PASSWORD_HASH_WAIT_MS,
    ),
    INVITATION_TTL_DAYS: days(DEFAULT_INVITATION_TTL_DAYS),
    MENTOR_PUBLISH_WINDOW_DAYS: days(DEFAULT_MENTOR_PUBLISH_WINDOW_DAYS),
    MAIL_PROVIDER: optional(z.enum(MAIL_PROVIDERS, 'must be resend or log')),
    MAIL_API_KEY: optional(z.string()),
    /** Sender, e.g. `DevMentor <noreply@example.com>`; Resend requires a verified domain. */
    MAIL_FROM: optional(z.string()),
    /** Platform currency (Q-P1: PLN); no default. */
    PLATFORM_CURRENCY: optional(z.string().refine(isTwoDecimalCurrency, 'must be an ISO 4217 currency with two decimals')),
    /** Price bounds per session length in cents of PLATFORM_CURRENCY (Q-P2); no default. */
    PLATFORM_PRICE_BOUNDS: optional(platformPriceBounds),
    /** Platform fee in basis points (R12/D15: 2000 = 20%), snapshotted on each booking at confirmation; below 10000 so a payout is never zero. */
    PLATFORM_FEE_BPS: optional(z.coerce.number().int().min(0).max(9999)).transform((bps) => bps ?? DEFAULT_PLATFORM_FEE_BPS),
    /** Stripe API secret key (`sk_test_…` / `sk_live_…`); never logged. */
    STRIPE_SECRET_KEY: optional(z.string()),
    /** Signing secret of the Checkout webhook endpoint (`whsec_…`). */
    STRIPE_WEBHOOK_SECRET: optional(z.string()),
    /** Stripe API base URL; a test override (the integration stub), refused without ALLOW_TEST_OVERRIDES=1. */
    STRIPE_API_URL: optional(baseUrl),
    ALLOW_TEST_OVERRIDES: z
      .enum(['0', '1'], 'must be 1 or 0')
      .default('0')
      .transform((flag) => flag === '1'),
  });

/** Every variable the schema reads; tests clear them so the runner's environment cannot leak in. */
export const ENV_KEYS = Object.keys(envShape.shape) as (keyof typeof envShape.shape)[];

const envSchema = envShape
  .superRefine((env, ctx) => {
    if ((env.PLATFORM_CURRENCY === undefined) !== (env.PLATFORM_PRICE_BOUNDS === undefined)) {
      const missing = env.PLATFORM_CURRENCY === undefined ? 'PLATFORM_CURRENCY' : 'PLATFORM_PRICE_BOUNDS';
      ctx.addIssue({ code: 'custom', path: [missing], message: 'PLATFORM_CURRENCY and PLATFORM_PRICE_BOUNDS are set together' });
    }

    if (env.ALLOW_TEST_OVERRIDES) {
      return;
    }

    for (const key of TEST_OVERRIDE_KEYS) {
      if (env[key] !== undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'test override URLs require ALLOW_TEST_OVERRIDES=1' });
      }
    }

    if (env.MAIL_PROVIDER === 'log' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_PROVIDER'],
        message: 'MAIL_PROVIDER=log in production requires ALLOW_TEST_OVERRIDES=1 (mail would only be logged)',
      });
    }
  })
  .transform((env) => ({
    ...env,
    DEVMENTOR_GITHUB_OAUTH_URL: env.DEVMENTOR_GITHUB_OAUTH_URL ?? DEFAULT_GITHUB_OAUTH_URL,
    DEVMENTOR_GITHUB_API_URL: env.DEVMENTOR_GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
    STRIPE_API_URL: env.STRIPE_API_URL ?? DEFAULT_STRIPE_API_URL,
    MAIL_PROVIDER: env.MAIL_PROVIDER ?? (env.NODE_ENV === 'production' ? 'resend' : 'log'),
  }));

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the environment. The error lists failing keys and reasons only,
 * never the values, so secrets do not end up in logs.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

const PRODUCTION_REQUIRED_KEYS = ['SESSION_SECRET', 'APP_URL'] as const;
const RESEND_REQUIRED_KEYS = ['MAIL_API_KEY', 'MAIL_FROM'] as const;

/**
 * Production refuses to serve without the values auth depends on. Called at the first
 * container creation (request time), not in the schema, so a build with no env still passes.
 */
export function assertProductionEnv(env: Env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const required = env.MAIL_PROVIDER === 'resend' ? [...PRODUCTION_REQUIRED_KEYS, ...RESEND_REQUIRED_KEYS] : PRODUCTION_REQUIRED_KEYS;
  const missing = required.filter((key) => env[key] === undefined);

  if (missing.length > 0) {
    throw new Error(`Invalid environment: ${missing.join(', ')} must be set in production`);
  }
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv();

  return cachedEnv;
}
