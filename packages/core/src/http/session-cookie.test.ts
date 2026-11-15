import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCookie, readSessionCookie, SESSION_COOKIE, sessionCookie } from './session-cookie';

describe('session cookie', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is named dm_session and lives 24 h', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(SESSION_COOKIE).toBe('dm_session');
    expect(sessionCookie('t.o.k')).toBe('dm_session=t.o.k; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400; Secure');
  });

  it('clears dm_session', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(clearSessionCookie()).toBe('dm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  });

  it('reads dm_session from the request', () => {
    const req = new Request('http://localhost/', { headers: { cookie: 'other=1; dm_session=t.o.k' } });

    expect(readSessionCookie(req)).toBe('t.o.k');
  });
});
