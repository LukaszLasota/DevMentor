import { defineConfig, type Options } from '@mikro-orm/postgresql';
import { entities } from './entities';

export interface DbOptions {
  clientUrl: string;
  pool: { min: number; max: number };
  debug: boolean;
}

/**
 * Base MikroORM config shared by the app runtime and the CLI.
 * Env parsing happens in the caller (core env schema or the CLI config).
 */
export function createConfig(options: DbOptions, overrides: Partial<Options> = {}): Options {
  return defineConfig({
    clientUrl: options.clientUrl,
    entities,
    pool: options.pool,
    discovery: { warnWhenNoEntities: false },
    debug: options.debug,
    ...overrides,
  });
}
