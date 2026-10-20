import type { EntityManager, MikroORM } from '@devmentor/db';
import type { Env } from '../config/env';
import type { Logger } from '../logger';
import type { HealthService } from '../services/health/health.service';

/**
 * Everything resolvable from the DI container. Each new service is one explicit
 * entry here and one registration in container.ts (no auto-discovery).
 */
export interface Cradle {
  env: Env;
  logger: Logger;
  orm: MikroORM;
  em: EntityManager;
  healthService: HealthService;
}
