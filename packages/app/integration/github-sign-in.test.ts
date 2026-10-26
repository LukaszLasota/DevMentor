import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { psql } from './psql';

// GitHub sign-in end to end: browser → app → GitHub stub (scripts/lib/github-stub.mjs) → PostgreSQL.
// The stub turns the `login` hint into a persona `<login>@devmentor.test`; global-setup makes
// `mock-operator@devmentor.test` the operator. Tests in this file share one browser session and run in order.
const baseUrl = inject('baseUrl');
const browser = createAgentBrowser(`devmentor-github-sign-in-${process.pid}`);
const GITHUB_BUTTON = 'a[href^="/api/auth/github"]';

/** `/api/auth/me` with an explicit session cookie value, outside the browser. */
function me(session: string) {
  return fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: `dm_session=${session}` } });
}

/** Presses "Sign out" in the account bar once the page has settled. */
async function signOut() {
  await browser.waitForIdle();
  await browser.clickButton('Sign out');
  await browser.waitForUrl('**/sign-in');
}

/** Opens `/sign-in` with the query and presses "Continue with GitHub". */
async function signInWithGithub(query: Record<string, string>) {
  await browser.open(`${baseUrl}/sign-in?${new URLSearchParams(query).toString()}`);
  await browser.waitForText('Sign in to DevMentor');
  await browser.waitForIdle();
  await browser.click(GITHUB_BUTTON);
}

async function sessionCookie(): Promise<string> {
  const value = await browser.cookie('dm_session');

  expect(value).toBeTruthy();
  return value as string;
}

describe('GitHub sign-in through the stub (agent-browser)', () => {
  let menteeSession = '';

  afterAll(async () => {
    await browser.close();
  });

  it('signs a new mentee in and lands on /mentors with the account bar', async () => {
    await signInWithGithub({ login: 'mock-mentee' });
    await browser.waitForUrl('**/mentors');
    await browser.waitForText('mock-mentee@devmentor.test');

    expect(new URL(await browser.url()).pathname).toBe('/mentors');
    expect(await browser.count('nav[aria-label="Your areas"] a')).toBe(0);
    expect(await browser.count('a[href="/admin"]')).toBe(0);
    expect(await psql("select roles from users where email = 'mock-mentee@devmentor.test'")).toBe('{mentee}');

    menteeSession = await sessionCookie();
    const response = await me(menteeSession);

    expect(response.status).toBe(200);
    expect((await response.json()).data.user).toMatchObject({
      email: 'mock-mentee@devmentor.test',
      roles: ['mentee'],
      githubLogin: 'mock-mentee',
      emailVerified: true,
    });
  });

  it('sends a mentee who opens /admin home with the operator notice', async () => {
    await browser.open(`${baseUrl}/admin`);
    await browser.waitForUrl('**/mentors?notice=operator_only');
    await browser.waitForText('This page is for operators.');
  });

  it('sends a signed-in user from /sign-in with an auth-page returnTo straight home', async () => {
    await browser.open(`${baseUrl}/sign-in?${new URLSearchParams({ returnTo: '/sign-in?returnTo=%2Fsign-in' })}`);
    await browser.waitForUrl('**/mentors');

    expect(new URL(await browser.url()).search).toBe('');
  });

  it('signs out with the button, and the old cookie is refused afterwards', async () => {
    await browser.open(`${baseUrl}/mentors`);
    await browser.waitForText('mock-mentee@devmentor.test');
    await signOut();
    await browser.waitForText('Sign in to DevMentor');

    expect(await browser.cookie('dm_session')).toBeUndefined();
    expect((await me(menteeSession)).status).toBe(401);
  });

  it('keeps returnTo through GitHub: /admin signed out → sign in as the operator → back on /admin', async () => {
    await browser.open(`${baseUrl}/admin`);
    await browser.waitForUrl('**/sign-in?returnTo=%2Fadmin');

    // The page forwards a `login` hint to GitHub; the stub picks the persona from it.
    await browser.open(`${await browser.url()}&login=mock-operator`);
    await browser.waitForIdle();
    await browser.click(GITHUB_BUTTON);
    await browser.waitForUrl('**/admin');
    await browser.waitForText('System status.');
    await browser.waitForText('Database');

    expect(await browser.text('header')).toContain('mock-operator@devmentor.test');
    expect(await browser.text('header')).toContain('Admin');
    expect(await psql("select roles from users where email = 'mock-operator@devmentor.test'")).toBe('{mentee,operator}');
  });

  it('shows the cancel message when the user cancels on GitHub', async () => {
    await signOut();

    await signInWithGithub({ login: 'deny' });
    await browser.waitForUrl('**/sign-in?error=github_cancelled');
    await browser.waitForText('You cancelled GitHub sign-in.');
  });

  it('refuses a GitHub account without a verified primary email', async () => {
    await signInWithGithub({ login: 'mock-unverified' });
    await browser.waitForUrl('**/sign-in?error=github_email_unverified');

    expect(await psql("select count(*) from users where email = 'mock-unverified@devmentor.test'")).toBe('0');
  });
});

describe('concurrent first GitHub sign-in (plain HTTP)', () => {
  /** Runs the start route and the stub's authorize step; returns the callback URL and its `dm_oauth` cookie. */
  async function startFlow(login: string) {
    const start = await fetch(`${baseUrl}/api/auth/github?login=${login}`, { redirect: 'manual' });
    const oauthCookie = start.headers.getSetCookie().find((cookie) => cookie.startsWith('dm_oauth='));
    const authorize = await fetch(start.headers.get('location') as string, { redirect: 'manual' });

    expect(start.status).toBe(302);
    expect(oauthCookie).toBeDefined();

    return { callback: authorize.headers.get('location') as string, cookie: (oauthCookie as string).split(';')[0] };
  }

  it('signs a returning user in again by GitHub id (rule 1)', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { callback, cookie } = await startFlow('mock-returning');
      const response = await fetch(callback, { redirect: 'manual', headers: { cookie } });

      expect(new URL(response.headers.get('location') as string, baseUrl).toString()).toBe(`${baseUrl}/mentors`);
    }

    expect(await psql("select count(*) from users where email = 'mock-returning@devmentor.test'")).toBe('1');
  });

  it('creates one user when parallel callbacks for the same new login race', async () => {
    const flows = await Promise.all(Array.from({ length: 4 }, () => startFlow('mock-race')));
    const results = await Promise.all(
      flows.map(({ callback, cookie }) => fetch(callback, { redirect: 'manual', headers: { cookie } })),
    );

    for (const response of results) {
      expect(new URL(response.headers.get('location') as string, baseUrl).toString()).toBe(`${baseUrl}/mentors`);
      expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('dm_session=') && !cookie.startsWith('dm_session=;'))).toBe(true);
    }

    expect(await psql("select count(*) from users where email = 'mock-race@devmentor.test'")).toBe('1');
  });

  it('links an email account to only one of two GitHub accounts racing with the same verified email (rule 2/3)', async () => {
    // A pending registration (no github_id); the stub gives `mock-link--b` mock-link's email under another id.
    await psql(
      "insert into users (id, email, created_at, updated_at) values (gen_random_uuid(), 'mock-link@devmentor.test', now(), now())",
    );
    const logins = ['mock-link', 'mock-link--b'];
    const flows = await Promise.all(logins.map((login) => startFlow(login)));
    const results = await Promise.all(
      flows.map(({ callback, cookie }) => fetch(callback, { redirect: 'manual', headers: { cookie } })),
    );
    const locations = results.map((response) => new URL(response.headers.get('location') as string, baseUrl).toString());
    const signedIn = results.map((response) =>
      response.headers.getSetCookie().some((cookie) => cookie.startsWith('dm_session=') && !cookie.startsWith('dm_session=;')),
    );
    const winner = locations.indexOf(`${baseUrl}/mentors`);

    expect([...locations].sort()).toEqual([`${baseUrl}/mentors`, `${baseUrl}/sign-in?error=github_account_conflict`]);
    expect(signedIn[winner]).toBe(true);
    expect(signedIn[1 - winner]).toBe(false);
    expect(await psql("select github_login from users where email = 'mock-link@devmentor.test'")).toBe(logins[winner]);
  });
});
