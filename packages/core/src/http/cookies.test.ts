import { afterEach, describe, expect, it, vi } from 'vitest';
import { authCookie, clearAuthCookie, readCookie } from './cookies';

const withCookie = (cookie?: string) =>
  new Request('http://localhost/', cookie === undefined ? {} : { headers: { cookie } });

describe('authCookie', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets HttpOnly, SameSite=Lax, Path=/ and Max-Age, without Secure outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(authCookie('dm_x', 'v1', { maxAgeSeconds: 600 })).toBe('dm_x=v1; HttpOnly; SameSite=Lax; Path=/; Max-Age=600');
  });

  it('adds Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(authCookie('dm_x', 'v1', { maxAgeSeconds: 600 })).toBe(
      'dm_x=v1; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure',
    );
  });

  it('clears a cookie with an empty value and Max-Age=0', () => {
    vi.stubEnv('NODE_ENV', 'test');

    expect(clearAuthCookie('dm_x')).toBe('dm_x=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  });
});

describe('readCookie', () => {
  it('finds the named cookie among others', () => {
    expect(readCookie(withCookie('a=1; dm_x=abc.def.ghi; b=2'), 'dm_x')).toBe('abc.def.ghi');
  });

  it('keeps "=" inside the value', () => {
    expect(readCookie(withCookie('dm_x=a=b'), 'dm_x')).toBe('a=b');
  });

  it('returns undefined when the header, the cookie or its value is missing', () => {
    expect(readCookie(withCookie(), 'dm_x')).toBeUndefined();
    expect(readCookie(withCookie('dm_xy=1; flag; x_dm_x=2'), 'dm_x')).toBeUndefined();
    expect(readCookie(withCookie('dm_x='), 'dm_x')).toBeUndefined();
  });
});
