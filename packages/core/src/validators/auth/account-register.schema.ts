import { z } from 'zod';
import { emailField } from './fields';

/** `POST /api/auth/register` `{ email }`; the password is set later from the mailed link. */
export const registerSchema = z.object({ email: emailField });

/** `POST /api/auth/verify-email/resend` takes the same body as registration. */
export const resendVerificationSchema = registerSchema;

export type RegisterInput = z.output<typeof registerSchema>;
export type ResendVerificationInput = RegisterInput;
