import { z } from 'zod';
import { emailField, returnToField } from './fields';

/**
 * `POST /api/auth/register` `{ email, returnTo? }`; the password is set later from the mailed link,
 * which carries `returnTo` (checked with `safeReturnTo`) so the user lands back where they started.
 */
export const registerSchema = z.object({ email: emailField, returnTo: returnToField });

/** `POST /api/auth/verify-email/resend` takes the same body as registration. */
export const resendVerificationSchema = registerSchema;

export type RegisterInput = z.output<typeof registerSchema>;
export type ResendVerificationInput = RegisterInput;
