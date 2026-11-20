import 'server-only';

export * from './errors';
export * from './envelope';
export { parseJsonBody, parseSearchParams, parseWith } from './parse';
export { apiHandler, withCookies, type ApiHandlerOptions, type HandlerArgs, type WithCookies } from './apiHandler';
export {
  redirectHandler,
  type ExternalRedirect,
  type InternalRedirect,
  type RedirectHandlerArgs,
  type RedirectHandlerOptions,
  type RedirectResult,
} from './redirectHandler';
export { safeReturnTo } from './return-to';
export { endSession, requireRole, requireSession } from './auth';
export {
  completeGithubSignIn,
  GITHUB_SIGN_IN_REDIRECT,
  GithubSignInCancelledError,
  GithubStateInvalidError,
  startGithubSignIn,
} from './github-sign-in';
export {
  CHECK_INBOX,
  CHECK_INBOX_RESPONSE,
  registerWithEmail,
  resendVerificationLink,
  signInWithPassword,
  VERIFY_EMAIL_RESPONSE,
  verifyEmailAndSetPassword,
  type CheckInbox,
  type EmailVerified,
  type SignedIn,
} from './email-sign-in';
export {
  acceptInvitation,
  INVITATION_RESPONSE,
  lookupInvitation,
  MENTOR_HOME,
  type InvitationAccepted,
  type InvitationTokenParams,
} from './invitations';
export {
  getOwnMentorPage,
  getPublicMentorPage,
  listMentors,
  MENTOR_LIST_RESPONSE,
  MENTOR_PAGE_RESPONSE,
  MENTOR_OWNER_RESPONSE,
  publishOwnMentorPage,
  unpublishOwnMentorPage,
  updateOwnMentorPage,
  updateOwnMentorPrices,
  type MentorSlugParams,
} from './mentors';
export type { MentorOwnerView, MentorPublicView } from '../services/mentors/mentor-profile.service';
export type { MentorListItem } from '../services/mentors/mentor-list-item';
export { receiveStripeWebhook, STRIPE_WEBHOOK_RESPONSE } from './stripe-webhook';
export { BOOKING_RESPONSE, getOwnBooking, startBooking, type BookingIdParams } from './bookings';
export type { BookingStarted, BookingView } from '../services/bookings/booking.service';
export { listMySlots, publishSlot, removeSlot, type SlotIdParams } from './availability';
export type { SlotView } from '../services/availability/slot.service';
export { INVALID_CREDENTIALS_MESSAGE, VerificationLinkInvalidError } from '../services/auth/account.service';
export { OAUTH_STATE_COOKIE } from './oauth-state-cookie';
export { clearSessionCookie, readSessionCookie, SESSION_COOKIE, sessionCookie } from './session-cookie';
export { createFetchJson, DEFAULT_OUTBOUND_TIMEOUT_MS, type FetchJson, type FetchJsonInit } from './outbound';
export { makeCrudRoute, type CrudService, type MakeCrudRouteOptions } from './makeCrudRoute';
