import 'server-only';

export { getOrm } from './orm';
export { DEFAULT_ROLES, ROLES, User, type Role } from './entities/auth/user.entity';
export type { DbOptions } from './config';
// Re-exported so no package other than db imports @mikro-orm/* directly.
export type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
// Value re-export: services catch it to handle a lost insert race (`instanceof`).
export { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
