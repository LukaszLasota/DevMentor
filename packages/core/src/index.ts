import 'server-only';

// Server entry of @devmentor/core. HTTP helpers: '@devmentor/core/http'.
export { getContainer, createRequestScope, withScope } from './container/container';
export type { Cradle } from './container/cradle';
export { getEnv, parseEnv, type Env } from './config/env';
export { logger, type Logger } from './logger';
export type { MailMessage, MailSender } from './mail/mail-sender';
export { MAIL_SENT_MESSAGE } from './mail/log-mailer';
export { systemClock, type Clock } from './time/clock';
export {
  requireSessionSecrets,
  signSession,
  verifySession,
  SESSION_TTL_SECONDS,
  type SessionClaims,
  type SessionSecrets,
} from './security/session-token';
export { PasswordHasher, type SlotHashing } from './security/password';
export {
  clientIp,
  guardPasswordAttempt,
  RateLimiter,
  rateLimitChecks,
  REGISTER_RATE_LIMITS,
  RESEND_RATE_LIMITS,
  SIGN_IN_RATE_LIMITS,
  type RateLimitCheck,
  type RateLimitPolicy,
} from './security/rate-limit';
export { getSessionUser, type SessionUser, type SessionUserDeps } from './auth/session-user';
export { homeFor } from './auth/home';
export type { Role } from '@devmentor/db';
export { EventBus, type DomainEventListener, type DomainEventName, type DomainEvents } from './events/events';
export { HealthService, type HealthStatus } from './services/health/health.service';
export {
  GithubEmailUnverifiedError,
  GithubOAuthService,
  type AuthorizeUrlInput,
  type ExchangeCodeInput,
  type GithubProfile,
} from './services/auth/github-oauth.service';
