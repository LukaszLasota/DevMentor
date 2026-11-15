import { apiHandler, CHECK_INBOX_RESPONSE, resendVerificationLink } from '@devmentor/core/http';

export const POST = apiHandler(resendVerificationLink, CHECK_INBOX_RESPONSE);
