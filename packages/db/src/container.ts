import { asFunction, asValue, type AwilixContainer } from 'awilix';
import type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { getOrm } from './orm';

export interface DbCradle {
  orm: MikroORM;
  em: EntityManager;
}

/**
 * Registers db services: the ORM as a singleton value and a forked
 * EntityManager per scope (one scope per request).
 */
export async function registerDb(container: AwilixContainer): Promise<void> {
  const orm = await getOrm();

  container.register({
    orm: asValue(orm),
    em: asFunction(({ orm }: DbCradle) => orm.em.fork()).scoped(),
  });
}
