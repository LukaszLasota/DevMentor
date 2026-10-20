import { MikroORM } from '@mikro-orm/postgresql';
import { createConfig } from './config';

const globalForOrm = globalThis as typeof globalThis & {
  devmentorOrm?: Promise<MikroORM>;
};

/**
 * Returns the single MikroORM instance for this process.
 * Cached on globalThis so dev hot reload does not open new pools.
 */
export function getOrm(): Promise<MikroORM> {
  globalForOrm.devmentorOrm ??= MikroORM.init(createConfig());

  return globalForOrm.devmentorOrm;
}
