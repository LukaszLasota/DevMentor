import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { psql } from './psql';

// Invitation routes and pages over HTTP against the production server (spec
// 2026-10-21-mentor-invitations, step 6). The full browser flow (script → link → sign in → accept)
// is step 8. Invitations are inserted with psql under a known raw token, stored the way the service
// stores it (SHA-256 hex); accounts get a session through the email link (verify-email).
const baseUrl = inject('baseUrl');
const PASSWORD = 'correct horse battery staple';
const CSRF = { 'x-devmentor-request': '1' };
const DOMAIN = '@invitation-routes.test';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}${DOMAIN}`;

afterAll(async () => {
  await psql(`delete from invitations where email like '%${DOMAIN}'`);
  await psql(`delete from users where email like '%${DOMAIN}'`);
});

/** A pending invitation for `email`; returns its raw token. */
async function invite(email: string, fields = ''): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await psql(
    `insert into invitations (id, email, token_hash, stack_tags, expires_at, created_at, updated_at)
     values (gen_random_uuid(), '${email}', '${sha256(token)}', array['typescript','react'], now() + interval '14 days', now(), now())`,
  );

  if (fields !== '') {
    await psql(`update invitations set ${fields} where token_hash = '${sha256(token)}'`);
  }

  return token;
}

/** A verified account with a password, signed in through its email link; returns the `dm_session` value. */
async function signedIn(email: string): Promise<string> {
  const id = randomUUID();
  const link = randomBytes(32).toString('base64url');
  await psql(`insert into users (id, email, created_at, updated_at) values ('${id}', '${email}', now(), now())`);
  await psql(
    `insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at, updated_at)
     values (gen_random_uuid(), '${id}', '${sha256(link)}', now() + interval '1 hour', now(), now())`,
  );
  const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...CSRF },
    body: JSON.stringify({ token: link, password: PASSWORD }),
  });
  expect(res.status).toBe(200);

  return sessionFrom(res);
}

function sessionFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('dm_session=')) ?? '';
  const value = cookie.split(';')[0]?.slice('dm_session='.length) ?? '';
  expect(value).not.toBe('');

  return value;
}

/** The `sv` claim of a session token (JWT payload, not verified here: the server checks it). */
function sessionVersionOf(session: string): number {
  return JSON.parse(Buffer.from(session.split('.')[1] ?? '', 'base64url').toString()).sv;
}

const lookup = (token: string) => fetch(`${baseUrl}/api/invitations/${token}`);
const accept = (token: string, session?: string) =>
  fetch(`${baseUrl}/api/invitations/${token}/accept`, {
    method: 'POST',
    headers: { ...CSRF, ...(session ? { cookie: `dm_session=${session}` } : {}) },
  });
const page = (path: string, session?: string) =>
  fetch(`${baseUrl}${path}`, { headers: session ? { cookie: `dm_session=${session}` } : {}, redirect: 'manual' });

/**
 * Where a guarded page sends the request. The guards run inside <Suspense> after the static shell
 * has streamed (partial prerendering), so the redirect arrives as a meta refresh in a 200 body,
 * not as a 307 `Location`.
 */
async function redirectTarget(res: Response): Promise<string | null> {
  const html = await res.text();

  return /http-equiv="refresh" content="\d+;url=([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&') ?? null;
}

function expectNoStore(res: Response): void {
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
}

describe('invitation routes over HTTP', () => {
  it('GET answers the invited email and tags; every invalid token gets the same 404', async () => {
    const email = uniqueEmail('lookup');
    const token = await invite(email);

    const ok = await lookup(token);
    expect(ok.status).toBe(200);
    expectNoStore(ok);
    expect(await ok.json()).toEqual({ ok: true, data: { email, stackTags: ['typescript', 'react'] } });

    const invalid = [
      'unknown-token',
      'not%20a%20token',
      await invite(uniqueEmail('expired'), `expires_at = now() - interval '1 second'`),
      await invite(uniqueEmail('revoked'), 'revoked_at = now()'),
    ];
    const bodies = [];

    for (const bad of invalid) {
      const res = await lookup(bad);
      expect(res.status, bad).toBe(404);
      expectNoStore(res);
      bodies.push(await res.json());
    }

    expect(new Set(bodies.map((body) => JSON.stringify(body)))).toEqual(
      new Set([JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'This invitation is not valid.' } })]),
    );
  });

  it('accept: 401 without a session, then 200 with a re-issued session; still signed in on /mentor; reuse is 409', async () => {
    const email = uniqueEmail('accept');
    const token = await invite(email);
    const session = await signedIn(email);

    const anonymous = await accept(token);
    expect(anonymous.status).toBe(401);
    expectNoStore(anonymous);

    const res = await accept(token, session);
    expect(res.status).toBe(200);
    expectNoStore(res);
    const body = await res.json();
    expect(body.data).toEqual({ roles: ['mentee', 'mentor'], publishDueAt: expect.any(String), redirect: '/mentor' });

    const renewed = sessionFrom(res);
    const [roles, version, due] = (
      await psql(
        `select array_to_string(u.roles, ','), u.session_version, to_char(p.initial_publish_due_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         from users u join mentor_profiles p on p.user_id = u.id where u.email = '${email}'`,
      )
    ).split('|');
    expect(roles).toBe('mentee,mentor');
    expect(sessionVersionOf(renewed)).toBe(Number(version));
    expect(due).toBe(body.data.publishDueAt);

    // The old cookie ended with the bump; the re-issued one keeps the mentor signed in.
    expect(await redirectTarget(await page('/mentor', session))).toBe('/sign-in?returnTo=%2Fmentor&reason=session_ended');
    const mentorHome = await (await page('/mentor', renewed)).text();
    expect(mentorHome).toContain('Publish at least one bookable session by');
    expect(mentorHome).not.toContain('http-equiv="refresh"');

    const again = await accept(token, renewed);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toEqual({ code: 'ALREADY_MENTOR', message: 'You are already a mentor.' });
    expect(again.headers.getSetCookie()).toEqual([]);
    expect(await psql(`select session_version from users where email = '${email}'`)).toBe(version);
  });

  it('accept by another account: 403, nothing granted, no new session; a used link is 404 for it', async () => {
    const email = uniqueEmail('invited');
    const token = await invite(email);
    const other = await signedIn(uniqueEmail('other'));

    const res = await accept(token, other);

    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await psql(`select accepted_at is null from invitations where token_hash = '${sha256(token)}'`)).toBe('t');
    expect(await psql(`select count(*) from mentor_profiles p join users u on u.id = p.user_id where u.email like 'other-%${DOMAIN}'`)).toBe('0');

    await accept(token, await signedIn(email));
    expect((await accept(token, other)).status).toBe(404);
  });

  it('accept without the CSRF header is 403', async () => {
    const res = await fetch(`${baseUrl}/api/invitations/${await invite(uniqueEmail('csrf'))}/accept`, { method: 'POST' });

    expect(res.status).toBe(403);
  });
});

describe('invitation and mentor pages over HTTP', () => {
  it('/invitation/<token> answers no-store, no-referrer; signed out it shows the invitation and sign-in links', async () => {
    const email = uniqueEmail('page');
    const token = await invite(email);

    const res = await page(`/invitation/${token}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expectNoStore(res);
    expect(html).toContain(email);
    expect(html).toContain(`/api/auth/github?returnTo=%2Finvitation%2F${token}`);
    expect(html).not.toContain('Accept invitation');

    const invalid = await (await page('/invitation/unknown-token')).text();
    expect(invalid).toContain('This invitation is not valid');
  });

  it('/mentor without the role sends the user home with notice=mentor_only', async () => {
    const res = await page('/mentor', await signedIn(uniqueEmail('mentee')));

    expect(await redirectTarget(res)).toBe('/mentors?notice=mentor_only');
  });
});
