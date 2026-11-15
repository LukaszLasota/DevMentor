import { describe, expect, it } from 'vitest';
import { hashToken, randomToken } from './token';

describe('randomToken', () => {
  it('returns 32 random bytes as base64url by default', () => {
    const token = randomToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(randomToken()).not.toBe(token);
  });

  it('honours the requested size', () => {
    expect(Buffer.from(randomToken(16), 'base64url')).toHaveLength(16);
  });
});

describe('hashToken', () => {
  it('returns the SHA-256 hex digest', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
