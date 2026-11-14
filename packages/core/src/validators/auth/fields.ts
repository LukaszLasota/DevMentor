import { z } from 'zod';

/** RFC 5321 limit for a forward path; longer addresses cannot be delivered. */
export const EMAIL_MAX_LENGTH = 254;
/** Password bounds (sign-in spec): no composition rules beyond the length. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
/** `randomToken()` yields 43 characters; the bound only stops oversized input. */
export const TOKEN_MAX_LENGTH = 256;

// One check, so a bad token yields exactly one message.
const LINK_TOKEN = new RegExp(`^[A-Za-z0-9_-]{1,${TOKEN_MAX_LENGTH}}$`);

/** Trimmed, lower-cased email (the same normalization the account service applies). */
export const emailField = z
  .string({ error: 'Enter your email.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email.')
  .max(EMAIL_MAX_LENGTH, `Email must be at most ${EMAIL_MAX_LENGTH} characters.`)
  .pipe(z.email('Enter a valid email address, e.g. name@example.com.'));

/** A new password: 12–128 characters, never trimmed (spaces are part of the password). */
export const newPasswordField = z
  .string({ error: 'Enter a password.' })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

/**
 * An existing password at sign-in: only presence and the upper bound (which caps hashing cost) are checked,
 * so a wrong password gets the generic "Invalid email or password." from the server, not a length hint.
 */
export const currentPasswordField = z
  .string({ error: 'Enter your password.' })
  .min(1, 'Enter your password.')
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

/** A link token from an email: non-empty base64url, at most `TOKEN_MAX_LENGTH` characters. */
export const linkTokenField = z
  .string({ error: 'This link is invalid.' })
  .regex(LINK_TOKEN, 'This link is invalid.');
