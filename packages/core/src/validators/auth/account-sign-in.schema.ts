import { z } from 'zod';
import { currentPasswordField, emailField } from './fields';

/** `POST /api/auth/sign-in` `{ email, password }`. */
export const signInSchema = z.object({ email: emailField, password: currentPasswordField });

export type SignInInput = z.output<typeof signInSchema>;
