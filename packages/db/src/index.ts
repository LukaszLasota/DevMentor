import 'server-only';

export { getOrm } from './orm';
export type { DbOptions } from './config';
// Re-exported so no package other than db imports @mikro-orm/* directly.
export type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
