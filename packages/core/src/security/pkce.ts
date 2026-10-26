import { createHash } from 'node:crypto';
import { randomToken } from './token';

/** PKCE method we use: S256 only (RFC 7636); `plain` would send the verifier itself. */
export const PKCE_METHOD = 'S256';

/**
 * PKCE code verifier: 32 random bytes as base64url (43 characters of the unreserved set,
 * within RFC 7636's 43–128). Kept server-side (in the signed OAuth state cookie), never sent to GitHub
 * before the token exchange.
 */
export function createPkceVerifier(): string {
  return randomToken();
}

/** S256 code challenge for `verifier`: BASE64URL(SHA-256(verifier)), sent in the authorize URL. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
