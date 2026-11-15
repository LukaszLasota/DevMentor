import { z } from 'zod';
import { linkTokenField, newPasswordField, returnToField } from './fields';

/**
 * `POST /api/auth/verify-email` `{ token, password, returnTo? }`: sets the password from the mailed
 * link; `returnTo` is the one the link's fragment carried.
 */
export const setPasswordSchema = z.object({ token: linkTokenField, password: newPasswordField, returnTo: returnToField });

export type SetPasswordInput = z.output<typeof setPasswordSchema>;
