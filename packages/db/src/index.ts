import 'server-only';

export { getOrm } from './orm';
export { DEFAULT_ROLES, ROLES, User, type Role } from './entities/auth/user.entity';
export {
  EMAIL_VERIFICATION_TTL_MS,
  EmailVerificationToken,
} from './entities/auth/email-verification-token.entity';
export { Invitation, STACK_TAGS, type StackTag } from './entities/invitations/invitation.entity';
export {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  MENTOR_PROFILE_SLUG_KEY,
  MentorProfile,
  SLUG_COLUMN_LENGTH,
} from './entities/mentors/mentor-profile.entity';
export type { DbOptions } from './config';
// Re-exported so no package other than db imports @mikro-orm/* directly.
export type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
// Value re-export: services catch it to handle a lost insert race (`instanceof`).
export { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
// Value re-export: services lock a row for a check-then-write (`lockMode: LockMode.PESSIMISTIC_WRITE`).
export { LockMode } from '@mikro-orm/postgresql';
