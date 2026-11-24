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
export { bookingCancelSchema, type BookingCancelInput } from './bookings/booking-cancel.schema';
export {
  bookingReportSchema,
  REPORT_MESSAGE_MAX,
  REPORT_MESSAGE_MIN,
  type BookingReportInput,
} from './bookings/booking-report.schema';
export { bookingStartSchema, type BookingStartInput } from './bookings/booking-start.schema';
export { MAX_STACK_TAGS, StackTags, type StackTagKey } from '../domain/vocabularies/stack-tags';
export {
  invitationCreateSchema,
  STACK_TAG_DUPLICATE_MESSAGE,
  STACK_TAG_REQUIRED_MESSAGE,
  STACK_TAG_UNKNOWN_MESSAGE,
  STACK_TAGS_TOO_MANY_MESSAGE,
  type InvitationCreateInput,
} from './invitations/invitation-create.schema';
export {
  ANSWER_MAX,
  ANSWER_MIN,
  MESSAGE_MAX,
  sessionAnswerSchema,
  sessionMessageSchema,
  sessionReadQuerySchema,
  type SessionAnswerInput,
  type SessionMessageInput,
  type SessionReadQuery,
} from './sessions/session-message.schema';
export {
  NOTE_MAX,
  NOTE_MIN,
  sessionNoteDecisionSchema,
  sessionNoteSchema,
  type SessionNoteDecisionInput,
  type SessionNoteInput,
} from './sessions/session-note.schema';
