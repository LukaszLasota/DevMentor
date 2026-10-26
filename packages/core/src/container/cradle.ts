import type { EntityManager, MikroORM } from '@devmentor/db';
import type { Env } from '../config/env';
import type { EventBus } from '../events/events';
import type { FetchJson } from '../http/outbound';
import type { Logger } from '../logger';
import type { GithubOAuthService } from '../services/auth/github-oauth.service';
import type { HealthService } from '../services/health/health.service';
import type { Clock } from '../time/clock';

/**
 * Everything resolvable from the DI container. Each new service is one explicit
 * entry here and one registration in container.ts (no auto-discovery).
 */
export interface Cradle {
  env: Env;
  logger: Logger;
  orm: MikroORM;
  clock: Clock;
  fetchJson: FetchJson;
  events: EventBus;
  em: EntityManager;
  healthService: HealthService;
  githubOAuthService: GithubOAuthService;
}
