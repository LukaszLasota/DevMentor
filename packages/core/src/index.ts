import 'server-only';

// Server entry of @devmentor/core. HTTP helpers: '@devmentor/core/http'.
export { getContainer, createRequestScope, withScope } from './container/container';
export type { Cradle } from './container/cradle';
export { getEnv, parseEnv, type Env } from './config/env';
export { logger, type Logger } from './logger';
export { systemClock, type Clock } from './time/clock';
export {
  requireSessionSecrets,
  signSession,
  verifySession,
  SESSION_TTL_SECONDS,
  type SessionClaims,
  type SessionSecrets,
} from './security/session-token';
export { EventBus, type DomainEventListener, type DomainEventName, type DomainEvents } from './events/events';
export { HealthService, type HealthStatus } from './services/health/health.service';
export {
  GithubEmailUnverifiedError,
  GithubOAuthService,
  type AuthorizeUrlInput,
  type ExchangeCodeInput,
  type GithubProfile,
} from './services/auth/github-oauth.service';
