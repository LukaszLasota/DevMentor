import 'server-only';

import { createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import { registerDb, type DbCradle } from '@devmentor/db';

/**
 * Composition root: the only place where the DI container is built.
 */
export type Cradle = DbCradle;

const globalForContainer = globalThis as typeof globalThis & {
  devmentorContainer?: Promise<AwilixContainer<Cradle>>;
};

async function buildContainer(): Promise<AwilixContainer<Cradle>> {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  await registerDb(container);

  return container;
}

export function getContainer(): Promise<AwilixContainer<Cradle>> {
  globalForContainer.devmentorContainer ??= buildContainer();

  return globalForContainer.devmentorContainer;
}

/**
 * Creates a per-request scope; resolve request services (e.g. `em`) from it.
 */
export async function createRequestScope(): Promise<AwilixContainer<Cradle>> {
  return (await getContainer()).createScope();
}
