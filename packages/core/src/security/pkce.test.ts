import { describe, expect, it } from 'vitest';
import { createPkceVerifier, PKCE_METHOD, pkceChallenge } from './pkce';

describe('PKCE', () => {
  it('creates a fresh 43-character base64url verifier', () => {
    const verifier = createPkceVerifier();

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createPkceVerifier()).not.toBe(verifier);
  });

  it('derives the S256 challenge (RFC 7636 appendix B vector)', () => {
    expect(PKCE_METHOD).toBe('S256');
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
