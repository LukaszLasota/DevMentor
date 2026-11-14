import { z } from 'zod';

export const DEFAULT_GITHUB_OAUTH_URL = 'https://github.com';
export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

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

/** Defaults of the hashing gate (`core/src/security/password.ts`): scrypt slots and the wait for one. */
export const DEFAULT_PASSWORD_HASH_CONCURRENCY = 2;
export const DEFAULT_PASSWORD_HASH_WAIT_MS = 3_000;

const TEST_OVERRIDE_KEYS = ['GITHUB_OAUTH_URL', 'GITHUB_API_URL'] as const;

/**
 * Tiers (platform-primitives spec, "API Contracts"):
 * - optional, checked at the route: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET;
 * - required at first container creation in production (see `assertProductionEnv`), never here,
 *   so `npm run build` with no env passes: SESSION_SECRET, APP_URL;
 * - dangerous configuration refused at boot: override URLs without ALLOW_TEST_OVERRIDES=1;
 * - defaulted: SESSION_SECRET_PREVIOUS, OPERATOR_EMAILS, GITHUB_OAUTH_URL, GITHUB_API_URL,
 *   TRUSTED_PROXY_HOPS (0: no client IP is trusted), PASSWORD_HASH_CONCURRENCY, PASSWORD_HASH_WAIT_MS.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL'),
    DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(0),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
    SESSION_SECRET: optional(hexSecret),
    SESSION_SECRET_PREVIOUS: optional(hexSecret),
    APP_URL: optional(baseUrl),
    GITHUB_CLIENT_ID: optional(z.string()),
    GITHUB_CLIENT_SECRET: optional(z.string()),
    GITHUB_OAUTH_URL: optional(baseUrl),
    GITHUB_API_URL: optional(baseUrl),
    OPERATOR_EMAILS: operatorEmails,
    /** Proxies in front of the app that append to `x-forwarded-for`; 0 = no client IP is derivable. */
    TRUSTED_PROXY_HOPS: optional(z.coerce.number().int().min(0).max(10)).transform((hops) => hops ?? 0),
    PASSWORD_HASH_CONCURRENCY: optional(z.coerce.number().int().min(1).max(64)).transform(
      (slots) => slots ?? DEFAULT_PASSWORD_HASH_CONCURRENCY,
    ),
    PASSWORD_HASH_WAIT_MS: optional(z.coerce.number().int().min(0).max(60_000)).transform(
      (ms) => ms ?? DEFAULT_PASSWORD_HASH_WAIT_MS,
    ),
    ALLOW_TEST_OVERRIDES: z
      .enum(['0', '1'], 'must be 1 or 0')
      .default('0')
      .transform((flag) => flag === '1'),
  })
  .superRefine((env, ctx) => {
    if (env.ALLOW_TEST_OVERRIDES) {
      return;
    }

    for (const key of TEST_OVERRIDE_KEYS) {
      if (env[key] !== undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'test override URLs require ALLOW_TEST_OVERRIDES=1' });
      }
    }
  })
  .transform((env) => ({
    ...env,
    GITHUB_OAUTH_URL: env.GITHUB_OAUTH_URL ?? DEFAULT_GITHUB_OAUTH_URL,
    GITHUB_API_URL: env.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
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

/**
 * Production refuses to serve without the values auth depends on. Called at the first
 * container creation (request time), not in the schema, so a build with no env still passes.
 */
export function assertProductionEnv(env: Env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const missing = PRODUCTION_REQUIRED_KEYS.filter((key) => env[key] === undefined);

  if (missing.length > 0) {
    throw new Error(`Invalid environment: ${missing.join(', ')} must be set in production`);
  }
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv();

  return cachedEnv;
}
