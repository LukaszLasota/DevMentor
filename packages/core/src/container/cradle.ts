import type { EntityManager, MikroORM } from '@devmentor/db';
import type { Env } from '../config/env';
import type { EventBus } from '../events/events';
import type { FetchJson } from '../http/outbound';
import type { Logger } from '../logger';
import type { MailSender } from '../mail/mail-sender';
import type { PasswordHasher } from '../security/password';
import type { RateLimiter } from '../security/rate-limit';
import type { AccountService } from '../services/auth/account.service';
import type { GithubOAuthService } from '../services/auth/github-oauth.service';
import type { HealthService } from '../services/health/health.service';
import type { InvitationService } from '../services/invitations/invitation.service';
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
  mailSender: MailSender;
  passwordHasher: PasswordHasher;
  em: EntityManager;
  rateLimiter: RateLimiter;
  healthService: HealthService;
  githubOAuthService: GithubOAuthService;
  accountService: AccountService;
  invitationService: InvitationService;
}
