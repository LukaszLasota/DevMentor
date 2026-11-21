import 'server-only';

export { getOrm } from './orm';
export { DEFAULT_ROLES, ROLES, User, type Role } from './entities/auth/user.entity';
export {
  EMAIL_VERIFICATION_TTL_MS,
  EmailVerificationToken,
} from './entities/auth/email-verification-token.entity';
export { Invitation, STACK_TAGS, type StackTag } from './entities/invitations/invitation.entity';
// The named slug key: `MentorProfileService` retries a slug collision only on this constraint.
export { MENTOR_PROFILE_SLUG_KEY, MentorProfile } from './entities/mentors/mentor-profile.entity';
export { ACTIVE_SLOT_UNIQUE, Slot } from './entities/availability/slot.entity';
export { StripeEvent } from './entities/payments/stripe-event.entity';
export {
  CONNECT_ACCOUNT_MENTOR_UNIQUE,
  ConnectAccount,
  ONBOARDING_STATUSES,
  type OnboardingStatus,
} from './entities/payments/connect-account.entity';
export { HOLD_REASONS, Payout, PAYOUT_BOOKING_UNIQUE, type HoldReason, type PayoutStatus } from './entities/payments/payout.entity';
export {
  ACTIVE_BOOKING_SLOT_UNIQUE,
  ACTIVE_BOOKING_STATUSES,
  Booking,
  type BookingStatus,
  type RefundStatus,
} from './entities/bookings/booking.entity';
export {
  BOOKING_REPORT_BOOKING_UNIQUE,
  BOOKING_REPORT_MESSAGE_MAX,
  BOOKING_REPORT_MESSAGE_MIN,
  BookingReport,
} from './entities/bookings/booking-report.entity';
export { SESSION_MESSAGE_MAX, SessionMessage } from './entities/sessions/session-message.entity';
export {
  SESSION_ANSWER_BOOKING_UNIQUE,
  SESSION_ANSWER_MAX,
  SESSION_ANSWER_MIN,
  SessionAnswer,
} from './entities/sessions/session-answer.entity';
export {
  NOTE_APPROVED_UNIQUE,
  NOTE_MAX_VERSIONS,
  NOTE_VERSION_UNIQUE,
  NOTE_WAITING_UNIQUE,
  SessionNoteVersion,
  type NoteDecision,
} from './entities/sessions/session-note-version.entity';
export { isUniqueViolation } from './errors';
export type { DbOptions } from './config';
// Re-exported so no package other than db imports @mikro-orm/* directly.
export type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
// Value re-export: services catch it to handle a lost insert race (`instanceof`).
export { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
// Value re-export: services lock a row for a check-then-write (`lockMode: LockMode.PESSIMISTIC_WRITE`).
export { LockMode } from '@mikro-orm/postgresql';
