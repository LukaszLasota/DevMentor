// Client-safe entry `@devmentor/core/validators`: shared Zod schemas only. Nothing here may import
// `server-only`, Node built-ins or other core modules except the client-safe `domain/` (guarded by
// `index.test.ts` and ESLint).
export {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RETURN_TO_MAX_LENGTH,
  TOKEN_MAX_LENGTH,
} from './auth/fields';
export {
  registerSchema,
  resendVerificationSchema,
  type RegisterInput,
  type ResendVerificationInput,
} from './auth/account-register.schema';
export { signInSchema, type SignInInput } from './auth/account-sign-in.schema';
export { setPasswordSchema, type SetPasswordInput } from './auth/password-set.schema';
export {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  isPublicWorkUrl,
  mentorProfileUpdateSchema,
  PUBLIC_WORK_URL_MAX,
  type MentorProfileUpdateInput,
} from './mentors/mentor-profile-update.schema';
export { isWholeMinuteUtc, slotCreateSchema, type SlotCreateInput } from './availability/slot-create.schema';
export { AMOUNT_MESSAGE, mentorPricesUpdateSchema, type MentorPricesUpdateInput } from './mentors/mentor-prices-update.schema';
export { mentorListQuerySchema, UNKNOWN_TAG_MESSAGE, type MentorListQuery } from './mentors/mentor-list-query.schema';
export { MAX_STACK_TAGS, StackTags, type StackTagKey } from '../domain/vocabularies/stack-tags';
