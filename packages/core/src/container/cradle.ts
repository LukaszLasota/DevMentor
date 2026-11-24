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
import type { PlatformSettingsService } from '../services/operator/platform-settings.service';
import type { CheckoutGateway } from '../services/payments/checkout-gateway';
import type { ConnectService } from '../services/payments/connect.service';
import type { PayoutService } from '../services/payments/payout.service';
import type { ConnectGateway } from '../services/payments/connect-gateway';
import type { StripeClient } from '../services/payments/stripe-client';
import type { StripeEventHandlers } from '../services/payments/stripe-event-handlers';
import type { StripeInboxService } from '../services/payments/stripe-inbox.service';
import type { SlotService } from '../services/availability/slot.service';
import type { BookingCancellationService } from '../services/bookings/booking-cancellation.service';
import type { BookingReportService } from '../services/bookings/booking-report.service';
import type { SessionNoteService } from '../services/sessions/session-note.service';
import type { SessionService } from '../services/sessions/session.service';
import type { BookingService } from '../services/bookings/booking.service';
import type { HealthService } from '../services/health/health.service';
import type { InvitationBatchService } from '../services/invitations/invitation-batch.service';
import type { InvitationService } from '../services/invitations/invitation.service';
import type { MentorListService } from '../services/mentors/mentor-list.service';
import type { MentorProfileService } from '../services/mentors/mentor-profile.service';
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
  platformSettingsService: PlatformSettingsService;
  stripeClient: StripeClient;
  checkoutGateway: CheckoutGateway;
  connectGateway: ConnectGateway;
  em: EntityManager;
  rateLimiter: RateLimiter;
  healthService: HealthService;
  githubOAuthService: GithubOAuthService;
  accountService: AccountService;
  invitationService: InvitationService;
  invitationBatchService: InvitationBatchService;
  mentorProfileService: MentorProfileService;
  mentorListService: MentorListService;
  slotService: SlotService;
  bookingService: BookingService;
  bookingCancellationService: BookingCancellationService;
  bookingReportService: BookingReportService;
  sessionService: SessionService;
  sessionNoteService: SessionNoteService;
  connectService: ConnectService;
  payoutService: PayoutService;
  stripeEventHandlers: StripeEventHandlers;
  stripeInboxService: StripeInboxService;
}
