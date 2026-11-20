import { asClass, asFunction, asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import { getOrm } from '@devmentor/db';
import { assertProductionEnv, getEnv } from '../config/env';
import { EventBus } from '../events/events';
import { createFetchJson } from '../http/outbound';
import { logger } from '../logger';
import { createMailSender } from '../mail/mail-sender';
import { PasswordHasher } from '../security/password';
import { RateLimiter } from '../security/rate-limit';
import { AccountService } from '../services/auth/account.service';
import { GithubOAuthService } from '../services/auth/github-oauth.service';
import { PlatformSettingsService } from '../services/operator/platform-settings.service';
import { StripeCheckoutGateway } from '../services/payments/stripe-checkout-gateway';
import { StripeClient } from '../services/payments/stripe-client';
import { createStripeEventHandlers } from '../services/payments/stripe-event-handlers';
import { StripeInboxService } from '../services/payments/stripe-inbox.service';
import { SlotService } from '../services/availability/slot.service';
import { HealthService } from '../services/health/health.service';
import { InvitationService } from '../services/invitations/invitation.service';
import { MentorProfileService } from '../services/mentors/mentor-profile.service';
import { systemClock } from '../time/clock';
import type { Cradle } from './cradle';

const globalForContainer = globalThis as typeof globalThis & {
  devmentorContainer?: Promise<AwilixContainer<Cradle>>;
};

async function buildContainer(): Promise<AwilixContainer<Cradle>> {
  const env = getEnv();
  assertProductionEnv(env);
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
    clock: asValue(systemClock),
    fetchJson: asFunction(({ logger }: Cradle) => createFetchJson({ logger })).singleton(),
    events: asClass(EventBus).singleton(),
    mailSender: asFunction(createMailSender).singleton(),
    // Singleton: its concurrency gate must be shared by every request in the process.
    passwordHasher: asFunction(
      ({ env }: Cradle) =>
        new PasswordHasher({ concurrency: env.PASSWORD_HASH_CONCURRENCY, waitMs: env.PASSWORD_HASH_WAIT_MS }),
    ).singleton(),
    // Singleton: reads the process env, holds no request state.
    platformSettingsService: asClass(PlatformSettingsService).singleton(),
    // Singletons: stateless Stripe access over the shared fetchJson (spec 2026-11-20-booking-stripe-checkout).
    stripeClient: asClass(StripeClient).singleton(),
    checkoutGateway: asClass(StripeCheckoutGateway).singleton(),
    em: asFunction(({ orm }: Cradle) => orm.em.fork()).scoped(),
    rateLimiter: asClass(RateLimiter).scoped(),
    healthService: asClass(HealthService).scoped(),
    githubOAuthService: asClass(GithubOAuthService).scoped(),
    accountService: asClass(AccountService).scoped(),
    invitationService: asClass(InvitationService).scoped(),
    mentorProfileService: asClass(MentorProfileService).scoped(),
    slotService: asClass(SlotService).scoped(),
    stripeEventHandlers: asFunction(createStripeEventHandlers).scoped(),
    stripeInboxService: asClass(StripeInboxService).scoped(),
  });

  // Resolved eagerly so the log mailer's "not delivered" warning appears at boot, not at the first mail.
  void container.cradle.mailSender;

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
