import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_TOKEN_BYTES = 32;

/** Unguessable URL-safe token (base64url) for links such as email verification and invitations. */
export function randomToken(bytes = DEFAULT_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex of a token. Store only this hash; look tokens up by hashing the presented value. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
