import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { Clock } from '../time/clock';

// The only algorithm we sign with and the only one any verifier accepts (no `none`, no RS/ES confusion).
const ALGORITHM = 'HS256';

export interface SignTokenOptions {
  /** Every JWT names its purpose; verifiers accept exactly one audience. */
  audience: string;
  ttlSeconds: number;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Signs `claims` as an HS256 JWT with `aud`, `iat` and `exp` taken from the injected clock. */
export async function signToken(
  claims: JWTPayload,
  { audience, ttlSeconds }: SignTokenOptions,
  secret: string,
  clock: Clock,
): Promise<string> {
  const issuedAt = Math.floor(clock.now().getTime() / 1000);

  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(keyFrom(secret));
}

/**
 * Verifies a token against each secret in order (current first, then previous ones — verify only).
 * Any failure (signature, algorithm, audience, expiry, malformed input) returns `null`, never throws.
 */
export async function verifyToken(
  token: string,
  audience: string,
  secrets: readonly string[],
  clock: Clock,
): Promise<JWTPayload | null> {
  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, keyFrom(secret), {
        algorithms: [ALGORITHM],
        audience,
        currentDate: clock.now(),
      });

      return payload;
    } catch {
      // Try the next secret; an invalid token fails for all of them.
    }
  }

  return null;
}
