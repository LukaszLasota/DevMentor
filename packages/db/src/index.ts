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
export { isUniqueViolation } from './errors';
export type { DbOptions } from './config';
// Re-exported so no package other than db imports @mikro-orm/* directly.
export type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
// Value re-export: services catch it to handle a lost insert race (`instanceof`).
export { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
// Value re-export: services lock a row for a check-then-write (`lockMode: LockMode.PESSIMISTIC_WRITE`).
export { LockMode } from '@mikro-orm/postgresql';
