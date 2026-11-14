import { apiHandler, CHECK_INBOX_RESPONSE, registerWithEmail } from '@devmentor/core/http';

export const POST = apiHandler(registerWithEmail, CHECK_INBOX_RESPONSE);
