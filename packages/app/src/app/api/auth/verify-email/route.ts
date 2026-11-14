import { apiHandler, VERIFY_EMAIL_RESPONSE, verifyEmailAndSetPassword } from '@devmentor/core/http';

export const POST = apiHandler(verifyEmailAndSetPassword, VERIFY_EMAIL_RESPONSE);
