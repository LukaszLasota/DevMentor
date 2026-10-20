import { defineConfig, type Options } from '@mikro-orm/postgresql';
import { entities } from './entities';

/**
 * Base MikroORM config shared by the app runtime and the CLI.
 */
export function createConfig(overrides: Partial<Options> = {}): Options {
  const clientUrl = process.env.DATABASE_URL;

  if (!clientUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  return defineConfig({
    clientUrl,
    entities,
    pool: {
      min: Number(process.env.DATABASE_POOL_MIN ?? 0),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    },
    discovery: { warnWhenNoEntities: false },
    debug: process.env.NODE_ENV === 'development',
    ...overrides,
  });
}
