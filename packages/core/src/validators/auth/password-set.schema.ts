import { z } from 'zod';
import { linkTokenField, newPasswordField } from './fields';

/** `POST /api/auth/verify-email` `{ token, password }`: sets the password from the mailed link. */
export const setPasswordSchema = z.object({ token: linkTokenField, password: newPasswordField });

export type SetPasswordInput = z.output<typeof setPasswordSchema>;
