import { asClass, asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import { getOrm } from '@devmentor/db';
import { getEnv } from '../config/env';
import { logger } from '../logger';
import { HealthService } from '../services/health/health.service';
import type { Cradle } from './cradle';

const globalForContainer = globalThis as typeof globalThis & {
  devmentorContainer?: Promise<AwilixContainer<Cradle>>;
};

async function buildContainer(): Promise<AwilixContainer<Cradle>> {
  const env = getEnv();
  const orm = await getOrm({
    clientUrl: env.DATABASE_URL,
    pool: { min: env.DATABASE_POOL_MIN, max: env.DATABASE_POOL_MAX },
    debug: env.NODE_ENV === 'development',
  });

  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  // Singletons: process-wide values. Scoped: one instance per request scope.
  container.register({
    env: asValue(env),
    logger: asValue(logger),
    orm: asValue(orm),
    em: asFunction(({ orm }: Cradle) => orm.em.fork()).scoped(),
    healthService: asClass(HealthService).scoped(),
  });

  return container;
}

/** The single container for this process; a failed build is not cached, so the next call retries. */
export function getContainer(): Promise<AwilixContainer<Cradle>> {
  globalForContainer.devmentorContainer ??= buildContainer().catch((error: unknown) => {
    globalForContainer.devmentorContainer = undefined;
    throw error;
  });

  return globalForContainer.devmentorContainer;
}

export async function createRequestScope(): Promise<AwilixContainer<Cradle>> {
  return (await getContainer()).createScope();
}

/** Runs `fn` with services from a fresh request scope and disposes the scope afterwards. */
export async function withScope<T>(fn: (cradle: Cradle) => Promise<T>): Promise<T> {
  const scope = await createRequestScope();

  try {
    return await fn(scope.cradle);
  } finally {
    await scope.dispose();
  }
}
