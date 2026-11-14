import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, inject, it } from 'vitest';
import { psql } from './psql';

// Email routes over HTTP against the production server: register, verify-email, sign-in, resend.
// Instead of reading the mailed link (`waitForMail`, used by the browser flow in email-browser.test.ts), a
// link token with a known raw value is inserted for the registered account, stored the way the app stores
// it (SHA-256 hex).
const baseUrl = inject('baseUrl');
const PASSWORD = 'correct horse battery staple';
const CSRF = { 'x-devmentor-request': '1' };

const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@devmentor.test`;

function post(path: string, body: unknown, headers: Record<string, string> = CSRF): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Inserts a fresh, unused link token for the account of `email` and returns its raw value. */
async function issueLink(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await psql(
    `insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at, updated_at)
     select gen_random_uuid(), id, '${tokenHash}', now() + interval '1 hour', now(), now() from users where email = '${email}'`,
  );

  return token;
}

/** The `dm_session` value the response set. */
function sessionFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('dm_session=')) ?? '';
  const value = cookie.split(';')[0]?.slice('dm_session='.length) ?? '';

  expect(value).not.toBe('');
  return value;
}

const me = (session: string) => fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: `dm_session=${session}` } });

describe('email registration and password sign-in over HTTP', () => {
  it('register answers the same 202 for a new and an existing email', async () => {
    const email = uniqueEmail('reg');

    for (const attempt of [1, 2]) {
      const res = await post('/api/auth/register', { email });

      expect(res.status, `attempt ${attempt}`).toBe(202);
      expect(await res.json()).toEqual({ ok: true, data: { status: 'check-inbox' } });
    }

    expect(await psql(`select count(*) from users where email = '${email}'`)).toBe('1');
  });

  it('refuses a request without the CSRF header with 403', async () => {
    const res = await post('/api/auth/register', { email: uniqueEmail('csrf') }, {});

    expect(res.status).toBe(403);
  });

  it('register → link → password → signed in; the link is single use; sign-in with the password works', async () => {
    const email = uniqueEmail('flow');
    expect((await post('/api/auth/register', { email, returnTo: '/mentors' })).status).toBe(202);

    // A pending account has no password: the same 401 as a wrong password.
    const pending = await post('/api/auth/sign-in', { email, password: PASSWORD });
    expect(pending.status).toBe(401);
    const pendingBody = await pending.json();

    const token = await issueLink(email);
    const verified = await post('/api/auth/verify-email', { token, password: PASSWORD, returnTo: '/mentors' });

    expect(verified.status).toBe(200);
    expect(verified.headers.get('cache-control')).toBe('no-store');
    expect(verified.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await verified.json()).data).toEqual({
      user: expect.objectContaining({ email, roles: ['mentee'], emailVerified: true }),
      redirectTo: '/mentors',
    });
    const linkSession = sessionFrom(verified);
    expect((await me(linkSession)).status).toBe(200);
    expect(await psql(`select session_version from users where email = '${email}'`)).toBe('1');

    // Reused link: 400, nothing changed.
    const reused = await post('/api/auth/verify-email', { token, password: `${PASSWORD}!` });
    expect(reused.status).toBe(400);
    expect((await reused.json()).error.code).toBe('VERIFICATION_LINK_INVALID');

    const wrong = await post('/api/auth/sign-in', { email, password: `${PASSWORD}!` });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual(pendingBody);
    expect(pendingBody.error).toEqual({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' });

    const signedIn = await post('/api/auth/sign-in', { email: email.toUpperCase(), password: PASSWORD });
    expect(signedIn.status).toBe(200);
    expect((await signedIn.json()).data.user).toMatchObject({ email, emailVerified: true });
    expect((await me(sessionFrom(signedIn))).status).toBe(200);
  });

  it('a new link ends the older session (bumped session_version) and refuses another account signed in', async () => {
    const email = uniqueEmail('relink');
    await post('/api/auth/register', { email });
    const first = sessionFrom(await post('/api/auth/verify-email', { token: await issueLink(email), password: PASSWORD }));

    // L13: a session of another account refuses the link and changes nothing.
    const other = uniqueEmail('other');
    await post('/api/auth/register', { email: other });
    const otherToken = await issueLink(other);
    const foreign = await post(
      '/api/auth/verify-email',
      { token: otherToken, password: PASSWORD },
      { ...CSRF, cookie: `dm_session=${first}` },
    );
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error.code).toBe('VERIFICATION_LINK_INVALID');
    expect(await psql(`select password_hash is null from users where email = '${other}'`)).toBe('t');

    // Setting the password again from a fresh link of the same account: new cookie, old one refused.
    const second = await post(
      '/api/auth/verify-email',
      { token: await issueLink(email), password: `${PASSWORD} 2` },
      { ...CSRF, cookie: `dm_session=${first}` },
    );
    expect(second.status).toBe(200);
    expect((await me(sessionFrom(second))).status).toBe(200);
    expect((await me(first)).status).toBe(401);
  });

  it('refuses an unknown or expired link with 400', async () => {
    const email = uniqueEmail('expired');
    await post('/api/auth/register', { email });
    const token = await issueLink(email);
    await psql(`update email_verification_tokens set expires_at = now() - interval '1 second' where token_hash = '${createHash('sha256').update(token).digest('hex')}'`);

    for (const candidate of [token, 'not-a-real-token']) {
      const res = await post('/api/auth/verify-email', { token: candidate, password: PASSWORD });

      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('VERIFICATION_LINK_INVALID');
    }
  });

  it('resend answers 202 for any email', async () => {
    for (const email of [uniqueEmail('resend'), 'nobody-here@devmentor.test']) {
      const res = await post('/api/auth/verify-email/resend', { email });

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ ok: true, data: { status: 'check-inbox' } });
    }
  });

  it('sign-in is 429 with Retry-After after 5 failed attempts for one email', async () => {
    const email = uniqueEmail('limited');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await post('/api/auth/sign-in', { email, password: 'wrong password' })).status, `attempt ${attempt}`).toBe(401);
    }

    const limited = await post('/api/auth/sign-in', { email, password: 'wrong password' });
    const body = await limited.json();

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS', retryAfterSeconds: Number(limited.headers.get('retry-after')) });
  });
});
