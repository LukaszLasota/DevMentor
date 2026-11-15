import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { AppError, ServiceUnavailableError } from '../../http/errors';
import type { FetchJsonInit } from '../../http/outbound';
import { GITHUB_SCOPE, GithubEmailUnverifiedError, GithubOAuthService } from './github-oauth.service';

const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  APP_URL: 'https://app.devmentor.test',
};
const CODE = 'the-oauth-code';
const TOKEN = 'gho_the-access-token';

type FetchImpl = (url: string, init: FetchJsonInit) => Promise<unknown>;

function setup(impl: FetchImpl = async () => ({}), envOverrides: Record<string, string | undefined> = {}) {
  const env = parseEnv({ ...BASE_ENV, ...envOverrides });
  const fetchJson = vi.fn((url: string | URL, init?: FetchJsonInit) => impl(String(url), init ?? {}));
  const logger = { warn: vi.fn() };
  const service = new GithubOAuthService({
    env,
    fetchJson: fetchJson as unknown as Cradle['fetchJson'],
    logger: logger as unknown as Cradle['logger'],
  });

  return { service, fetchJson, logger };
}

function profileApi(user: unknown, emails: unknown): FetchImpl {
  return async (url) => (url.endsWith('/user/emails') ? emails : user);
}

const USER = { id: 4242, login: 'Octo-Cat', avatar_url: 'https://avatars.example.test/u/4242' };

describe('GithubOAuthService.buildAuthorizeUrl', () => {
  it('builds the authorize URL with client id, callback, scope, state and S256 PKCE', () => {
    const { service } = setup();

    const url = service.buildAuthorizeUrl({ state: 'st', codeChallenge: 'ch' });

    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-id',
      redirect_uri: 'https://app.devmentor.test/api/auth/github/callback',
      scope: GITHUB_SCOPE,
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
    expect(GITHUB_SCOPE).toBe('read:user user:email');
  });

  it('appends paths to an overridden base URL that has a path (test stub)', () => {
    const { service } = setup(undefined, { ALLOW_TEST_OVERRIDES: '1', DEVMENTOR_GITHUB_OAUTH_URL: 'http://localhost:4010/github/' });

    const url = service.buildAuthorizeUrl({ state: 's', codeChallenge: 'c' });

    expect(`${url.origin}${url.pathname}`).toBe('http://localhost:4010/github/login/oauth/authorize');
  });

  it.each(['octocat', 'Octo-Cat-2', 'a', 'a'.repeat(39)])('forwards a valid login hint %s', (login) => {
    const { service } = setup();

    expect(service.buildAuthorizeUrl({ state: 's', codeChallenge: 'c', login }).searchParams.get('login')).toBe(login);
  });

  it.each(['', 'a'.repeat(40), 'octo cat', 'octo_cat', 'x&scope=repo', 'émile'])('drops an invalid login hint %j', (login) => {
    const { service } = setup();

    expect(service.buildAuthorizeUrl({ state: 's', codeChallenge: 'c', login }).searchParams.has('login')).toBe(false);
  });

  it.each(['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'APP_URL'])('fails closed when %s is missing', (key) => {
    const { service } = setup(undefined, { [key]: undefined });

    expect(() => service.buildAuthorizeUrl({ state: 's', codeChallenge: 'c' })).toThrow(ServiceUnavailableError);
  });
});

describe('GithubOAuthService.exchangeCode', () => {
  it('posts the code, verifier and credentials as a form and returns the access token', async () => {
    const { service, fetchJson } = setup(async () => ({ access_token: TOKEN, token_type: 'bearer', scope: GITHUB_SCOPE }));

    await expect(service.exchangeCode({ code: CODE, codeVerifier: 'verifier' })).resolves.toBe(TOKEN);

    const [url, init] = fetchJson.mock.calls[0];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: CODE,
      redirect_uri: 'https://app.devmentor.test/api/auth/github/callback',
      code_verifier: 'verifier',
    });
  });

  it('maps a GitHub error response (200 with error) to 503 and logs only the error identifier', async () => {
    const { service, logger } = setup(async () => ({
      error: 'bad_verification_code',
      error_description: 'The code passed is incorrect or expired.',
    }));

    await expect(service.exchangeCode({ code: CODE, codeVerifier: 'v' })).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(logger.warn).toHaveBeenCalledWith({ githubError: 'bad_verification_code' }, 'GitHub token exchange failed');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(CODE);
  });

  it('maps an unexpected token response to 503', async () => {
    const { service, logger } = setup(async () => ({ access_token: '' }));

    await expect(service.exchangeCode({ code: CODE, codeVerifier: 'v' })).rejects.toMatchObject({ status: 503 });
    expect(logger.warn).toHaveBeenCalledWith({ githubError: 'unexpected_response' }, 'GitHub token exchange failed');
  });

  it('propagates a timeout or upstream 503 from fetchJson', async () => {
    const timeout = new ServiceUnavailableError('An upstream service is unavailable.');
    const { service } = setup(async () => {
      throw timeout;
    });

    await expect(service.exchangeCode({ code: CODE, codeVerifier: 'v' })).rejects.toBe(timeout);
  });

  it('fails closed without calling GitHub when the client secret is missing', async () => {
    const { service, fetchJson } = setup(undefined, { GITHUB_CLIENT_SECRET: '' });

    await expect(service.exchangeCode({ code: CODE, codeVerifier: 'v' })).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('GithubOAuthService.fetchProfile', () => {
  it('returns the profile with the verified primary email lower-cased', async () => {
    const { service, fetchJson } = setup(
      profileApi(USER, [
        { email: 'other@example.test', primary: false, verified: true },
        { email: ' Octo.Cat@Example.TEST ', primary: true, verified: true, visibility: 'private' },
      ]),
    );

    await expect(service.fetchProfile(TOKEN)).resolves.toEqual({
      githubId: 4242,
      login: 'Octo-Cat',
      avatarUrl: 'https://avatars.example.test/u/4242',
      email: 'octo.cat@example.test',
    });

    expect(fetchJson.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://api.github.com/user',
      'https://api.github.com/user/emails',
    ]);
    for (const [, init] of fetchJson.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(headers.get('accept')).toBe('application/vnd.github+json');
      expect(headers.get('user-agent')).toBe('DevMentor');
    }
  });

  it('returns a null avatar when GitHub sends none', async () => {
    const { service } = setup(profileApi({ id: 1, login: 'x' }, [{ email: 'x@example.test', primary: true, verified: true }]));

    await expect(service.fetchProfile(TOKEN)).resolves.toMatchObject({ avatarUrl: null });
  });

  it('refuses an unverified primary email even when another email is verified', async () => {
    const { service } = setup(
      profileApi(USER, [
        { email: 'primary@example.test', primary: true, verified: false },
        { email: 'other@example.test', primary: false, verified: true },
      ]),
    );

    const error = await service.fetchProfile(TOKEN).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GithubEmailUnverifiedError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 403, code: 'GITHUB_EMAIL_UNVERIFIED' });
  });

  it('refuses when GitHub returns no emails', async () => {
    const { service } = setup(profileApi(USER, []));

    await expect(service.fetchProfile(TOKEN)).rejects.toBeInstanceOf(GithubEmailUnverifiedError);
  });

  it('maps an unexpected /user shape to 503 and logs only the issue paths', async () => {
    const { service, logger } = setup(profileApi({ id: 'not-a-number', login: 'secret-login' }, []));

    await expect(service.fetchProfile(TOKEN)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(logger.warn).toHaveBeenCalledWith({ endpoint: '/user', issues: ['id'] }, 'Unexpected GitHub response');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/secret-login|gho_/);
  });

  it('maps an unexpected /user/emails shape to 503', async () => {
    const { service, logger } = setup(profileApi(USER, { message: 'Requires authentication' }));

    await expect(service.fetchProfile(TOKEN)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(logger.warn).toHaveBeenCalledWith({ endpoint: '/user/emails', issues: [''] }, 'Unexpected GitHub response');
  });

  it('propagates a timeout or upstream 503 from fetchJson', async () => {
    const timeout = new ServiceUnavailableError('An upstream service is unavailable.');
    const { service } = setup(async () => {
      throw timeout;
    });

    await expect(service.fetchProfile(TOKEN)).rejects.toBe(timeout);
  });
});
