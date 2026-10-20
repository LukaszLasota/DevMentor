import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL'),
  DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(0),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
});

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

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv();

  return cachedEnv;
}
