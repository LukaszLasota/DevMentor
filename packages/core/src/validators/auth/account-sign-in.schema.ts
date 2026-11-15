import { z } from 'zod';
import { currentPasswordField, emailField, returnToField } from './fields';

/**
 * `POST /api/auth/sign-in` `{ email, password, returnTo? }`; the server answers with the page to land
 * on (`safeReturnTo(returnTo, homeFor(roles))`), so the redirect rule lives in one place.
 */
export const signInSchema = z.object({ email: emailField, password: currentPasswordField, returnTo: returnToField });

export type SignInInput = z.output<typeof signInSchema>;
