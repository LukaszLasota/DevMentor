import { User, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { pkceChallenge } from '../security/pkce';
import { verifySession } from '../security/session-token';
import { GithubAccountConflictError } from '../services/auth/account.service';
import { GithubOAuthService, type GithubProfile } from '../services/auth/github-oauth.service';
import type { Clock } from '../time/clock';
import type { FetchJsonInit } from './outbound';
import {
  completeGithubSignIn,
  GITHUB_SIGN_IN_REDIRECT,
  GithubSignInCancelledError,
  GithubStateInvalidError,
  startGithubSignIn,
} from './github-sign-in';
import { readOAuthState, signOAuthState, type OAuthState } from './oauth-state-cookie';
import { redirectHandler } from './redirectHandler';

const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const NOW = new Date('2026-10-26T12:00:00.000Z');
const clock: Clock = { now: () => NOW };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_SECRET: SECRET,
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  APP_URL: 'https://app.devmentor.test',
};
const CLEARED_OAUTH = 'dm_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
const OAUTH_STATE: OAuthState = { state: 'the-state', verifier: 'the-verifier' };
const noParams = { params: Promise.resolve({}) };

const PROFILE: GithubProfile = {
  githubId: 4242,
  login: 'octo-cat',
  avatarUrl: 'https://avatars.example.test/u/4242',
  email: 'octo@devmentor.test',
};

type FetchImpl = (url: string, init: FetchJsonInit) => Promise<unknown>;

/** GitHub's token endpoint, `/user` and `/user/emails` answering successfully. */
const githubUp: FetchImpl = async (url) => {
  if (url.endsWith('/login/oauth/access_token')) {
    return { access_token: 'gho_token' };
  }

  if (url.endsWith('/user/emails')) {
    return [{ email: 'Octo@devmentor.test', primary: true, verified: true }];
  }

  return { id: 4242, login: 'octo-cat', avatar_url: 'https://avatars.example.test/u/4242' };
};

function makeUser(roles: Role[] = ['mentee'], sessionVersion = 3): User {
  return Object.assign(new User(), { id: USER_ID, email: 'octo@devmentor.test', roles, sessionVersion });
}

interface SetupOptions {
  env?: Record<string, string | undefined>;
  fetch?: FetchImpl;
  resolve?: (profile: GithubProfile) => Promise<User>;
}

function setup({ env: envOverrides = {}, fetch = githubUp, resolve = async () => makeUser() }: SetupOptions = {}) {
  const env = parseEnv({ ...BASE_ENV, ...envOverrides });
  const fetchJson = vi.fn((url: string | URL, init?: FetchJsonInit) => fetch(String(url), init ?? {}));
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const githubOAuthService = new GithubOAuthService({
    env,
    fetchJson: fetchJson as unknown as Cradle['fetchJson'],
    logger: logger as unknown as Cradle['logger'],
  });
  const accountService = { resolveGithubAccount: vi.fn(resolve) };

  scope.cradle = { env, clock, logger, githubOAuthService, accountService };

  return { env, fetchJson, logger, accountService };
}

const start = redirectHandler(startGithubSignIn, GITHUB_SIGN_IN_REDIRECT);
const callback = redirectHandler(completeGithubSignIn, GITHUB_SIGN_IN_REDIRECT);

function startRequest(query = ''): Request {
  return new Request(`http://localhost/api/auth/github${query}`);
}

async function callbackRequest(query: string, oauthState: OAuthState | null = OAUTH_STATE): Promise<Request> {
  const headers: HeadersInit = oauthState === null ? {} : { cookie: `dm_oauth=${await signOAuthState(oauthState, SECRET, clock)}` };

  return new Request(`http://localhost/api/auth/github/callback${query}`, { headers });
}

/** The `dm_oauth` state the start route set, read back as the callback would. */
async function stateFrom(res: Response): Promise<OAuthState | null> {
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0] ?? '';

  return readOAuthState(new Request('http://localhost/', { headers: { cookie } }), { current: SECRET }, clock);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/auth/github (startGithubSignIn)', () => {
  it('sets dm_oauth and redirects to GitHub with state, PKCE challenge and login hint', async () => {
    const { fetchJson } = setup();

    const res = await start(startRequest('?returnTo=%2Fmentors%2F42&login=octo-cat'), noParams);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe('https://github.com/login/oauth/authorize');

    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^dm_oauth=[\w-]+\.[\w-]+\.[\w-]+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600$/);

    const oauthState = await stateFrom(res);
    expect(oauthState).toEqual({ state: location.searchParams.get('state'), verifier: expect.any(String), returnTo: '/mentors/42' });
    expect(location.searchParams.get('code_challenge')).toBe(pkceChallenge(oauthState?.verifier ?? ''));
    expect(location.searchParams.get('login')).toBe('octo-cat');
    // The verifier never leaves the server before the token exchange.
    expect(location.href).not.toContain(oauthState?.verifier);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('uses a fresh state and verifier for every start', async () => {
    setup();

    const first = await stateFrom(await start(startRequest(), noParams));
    const second = await stateFrom(await start(startRequest(), noParams));

    expect(first?.state).not.toBe(second?.state);
    expect(first?.verifier).not.toBe(second?.verifier);
  });

  it.each(['https://evil.example/', '//evil.example', '/api/auth/me', ''])('drops an unsafe returnTo (%j)', async (returnTo) => {
    setup();

    const res = await start(startRequest(`?returnTo=${encodeURIComponent(returnTo)}&login=${encodeURIComponent('bad login!')}`), noParams);

    expect(await stateFrom(res)).toEqual({ state: expect.any(String), verifier: expect.any(String) });
    expect(new URL(res.headers.get('location') ?? '').searchParams.has('login')).toBe(false);
  });

  it.each([
    ['SESSION_SECRET', { SESSION_SECRET: undefined }],
    ['GITHUB_CLIENT_ID', { GITHUB_CLIENT_ID: undefined }],
    ['GITHUB_CLIENT_SECRET', { GITHUB_CLIENT_SECRET: undefined }],
    ['APP_URL', { APP_URL: undefined }],
  ])('sends the user to github_unavailable without %s', async (_key, env) => {
    setup({ env });

    const res = await start(startRequest(), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable');
    expect(res.headers.getSetCookie()).toEqual([CLEARED_OAUTH]);
  });
});

describe('GET /api/auth/github/callback (completeGithubSignIn)', () => {
  it('signs in: session cookie with the user version, dm_oauth cleared, home for the roles', async () => {
    const { fetchJson, accountService } = setup({ resolve: async () => makeUser(['mentee', 'mentor'], 3) });

    const res = await callback(await callbackRequest('?code=the-code&state=the-state'), noParams);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/mentor');
    const [session, cleared] = res.headers.getSetCookie();
    expect(session).toMatch(/^dm_session=[\w-]+\.[\w-]+\.[\w-]+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=86400$/);
    expect(cleared).toBe(CLEARED_OAUTH);
    const token = session?.split(';')[0]?.slice('dm_session='.length) ?? '';
    await expect(verifySession(token, { current: SECRET }, clock)).resolves.toEqual({ sub: USER_ID, sv: 3 });

    const exchange = fetchJson.mock.calls.find(([url]) => String(url).endsWith('/login/oauth/access_token'));
    const body = exchange?.[1]?.body as URLSearchParams;
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(accountService.resolveGithubAccount).toHaveBeenCalledWith(PROFILE);
  });

  it('lands a mentee without returnTo on /mentors', async () => {
    setup();

    const res = await callback(await callbackRequest('?code=c&state=the-state'), noParams);

    expect(res.headers.get('location')).toBe('/mentors');
  });

  it('honours the stored returnTo', async () => {
    setup({ resolve: async () => makeUser(['mentee', 'operator']) });

    const res = await callback(
      await callbackRequest('?code=c&state=the-state', { ...OAUTH_STATE, returnTo: '/invitation/abc?x=1' }),
      noParams,
    );

    expect(res.headers.get('location')).toBe('/invitation/abc?x=1');
  });

  it.each(['//evil.example', 'https://evil.example/', '/api/auth/me'])('replaces an unsafe stored returnTo (%s) with home', async (returnTo) => {
    setup({ resolve: async () => makeUser(['mentee', 'operator']) });

    const res = await callback(await callbackRequest('?code=c&state=the-state', { ...OAUTH_STATE, returnTo }), noParams);

    expect(res.headers.get('location')).toBe('/admin');
  });

  describe('refuses before any outbound call', () => {
    it.each([
      ['the state does not match', '?code=c&state=other-state', OAUTH_STATE],
      ['the state is missing', '?code=c', OAUTH_STATE],
      ['the dm_oauth cookie is missing', '?code=c&state=the-state', null],
    ] as const)('when %s', async (_label, query, oauthState) => {
      const { fetchJson, accountService } = setup();

      const res = await callback(await callbackRequest(query, oauthState), noParams);

      expect(res.headers.get('location')).toBe('/sign-in?error=github_state_invalid');
      expect(res.headers.getSetCookie()).toEqual([CLEARED_OAUTH]);
      expect(fetchJson).not.toHaveBeenCalled();
      expect(accountService.resolveGithubAccount).not.toHaveBeenCalled();
    });

    it('when the dm_oauth cookie is tampered or expired', async () => {
      const { fetchJson } = setup();
      const token = await signOAuthState(OAUTH_STATE, SECRET, { now: () => new Date(NOW.getTime() - 11 * 60 * 1000) });
      const forged = await signOAuthState(OAUTH_STATE, 'f'.repeat(64), clock);

      for (const cookie of [`dm_oauth=${token}`, `dm_oauth=${forged}`]) {
        const req = new Request('http://localhost/api/auth/github/callback?code=c&state=the-state', { headers: { cookie } });
        const res = await callback(req, noParams);

        expect(res.headers.get('location')).toBe('/sign-in?error=github_state_invalid');
      }

      expect(fetchJson).not.toHaveBeenCalled();
    });

    it('when SESSION_SECRET is missing (github_unavailable)', async () => {
      const { fetchJson } = setup({ env: { SESSION_SECRET: undefined } });

      const res = await callback(await callbackRequest('?code=c&state=the-state'), noParams);

      expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable');
      expect(fetchJson).not.toHaveBeenCalled();
    });
  });

  it('maps a cancel on GitHub to github_cancelled', async () => {
    const { fetchJson } = setup();

    const res = await callback(await callbackRequest('?error=access_denied&state=the-state', null), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_cancelled');
    expect(res.headers.getSetCookie()).toEqual([CLEARED_OAUTH]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it.each([
    ['another GitHub error', '?error=redirect_uri_mismatch&state=the-state', 'redirect_uri_mismatch'],
    ['no code', '?state=the-state', 'missing_code'],
    ['an empty code', '?code=&state=the-state', 'missing_code'],
  ])('maps %s with a valid state to github_unavailable', async (_label, query, githubError) => {
    const { fetchJson, logger } = setup();

    const res = await callback(await callbackRequest(query), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable');
    expect(logger.warn).toHaveBeenCalledWith({ githubError }, 'GitHub callback without a code');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('maps a failed token exchange or GitHub outage to github_unavailable', async () => {
    const { accountService } = setup({ fetch: async () => ({ error: 'bad_verification_code' }) });

    const res = await callback(await callbackRequest('?code=c&state=the-state'), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable');
    expect(res.headers.getSetCookie()).toEqual([CLEARED_OAUTH]);
    expect(accountService.resolveGithubAccount).not.toHaveBeenCalled();
  });

  it('maps no verified primary email to github_email_unverified', async () => {
    setup({
      fetch: async (url, init) =>
        url.endsWith('/user/emails') ? [{ email: 'o@x.test', primary: true, verified: false }] : githubUp(url, init),
    });

    const res = await callback(await callbackRequest('?code=c&state=the-state'), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_email_unverified');
    expect(res.headers.getSetCookie()).toEqual([CLEARED_OAUTH]);
  });

  it('maps an email linked to another GitHub account to github_account_conflict', async () => {
    setup({
      resolve: async () => {
        throw new GithubAccountConflictError();
      },
    });

    const res = await callback(await callbackRequest('?code=c&state=the-state'), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_account_conflict');
    expect(res.headers.getSetCookie()).toEqual([CLEARED_OAUTH]);
  });
});

describe('GitHub sign-in failures keep the requested page (phase 2 review)', () => {
  it('start: missing configuration keeps the safe returnTo of the query', async () => {
    setup({ env: { GITHUB_CLIENT_ID: undefined } });

    const res = await start(startRequest('?returnTo=%2Fmentors%2Fabc&login=octo'), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable&returnTo=%2Fmentors%2Fabc');
  });

  it('start: an unsafe returnTo is not carried', async () => {
    setup({ env: { SESSION_SECRET: undefined } });

    const res = await start(startRequest('?returnTo=%2F%2Fevil.example'), noParams);

    expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable');
  });

  it('callback: a cancel with a valid state keeps the stored returnTo', async () => {
    setup();

    const res = await callback(
      await callbackRequest('?error=access_denied&state=the-state', { ...OAUTH_STATE, returnTo: '/mentors/abc' }),
      noParams,
    );

    expect(res.headers.get('location')).toBe('/sign-in?error=github_cancelled&returnTo=%2Fmentors%2Fabc');
  });

  it('callback: a cancel with a state that does not match carries no returnTo', async () => {
    setup();

    const res = await callback(
      await callbackRequest('?error=access_denied&state=other', { ...OAUTH_STATE, returnTo: '/mentors/abc' }),
      noParams,
    );

    expect(res.headers.get('location')).toBe('/sign-in?error=github_cancelled');
  });

  it('callback: a GitHub outage after a valid state keeps the stored returnTo', async () => {
    setup({ fetch: async () => ({ error: 'bad_verification_code' }) });

    const res = await callback(
      await callbackRequest('?code=c&state=the-state', { ...OAUTH_STATE, returnTo: '/mentors/abc' }),
      noParams,
    );

    expect(res.headers.get('location')).toBe('/sign-in?error=github_unavailable&returnTo=%2Fmentors%2Fabc');
  });

  it('callback: an invalid state carries no returnTo (nothing trusted to read it from)', async () => {
    setup();

    const res = await callback(
      await callbackRequest('?code=c&state=other', { ...OAUTH_STATE, returnTo: '/mentors/abc' }),
      noParams,
    );

    expect(res.headers.get('location')).toBe('/sign-in?error=github_state_invalid');
  });
});

describe('GitHub sign-in errors', () => {
  it('carry the codes the sign-in page maps', () => {
    expect(new GithubSignInCancelledError()).toMatchObject({ status: 400, code: 'GITHUB_CANCELLED' });
    expect(new GithubStateInvalidError()).toMatchObject({ status: 400, code: 'GITHUB_STATE_INVALID' });
  });
});
