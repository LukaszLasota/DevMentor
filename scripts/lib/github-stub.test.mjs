import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOGIN,
  DEFAULT_PORT,
  decodeCode,
  emailFor,
  encodeCode,
  githubIdFor,
  main,
  pkceChallenge,
  startGithubStub,
} from './github-stub.mjs';

const VERIFIER = 'a'.repeat(43);
const CHALLENGE = pkceChallenge(VERIFIER);
const REDIRECT_URI = 'http://app.test/api/auth/github/callback';

let stub;

async function authorize(params) {
  const query = new URLSearchParams({
    client_id: 'client',
    redirect_uri: REDIRECT_URI,
    state: 'state-1',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    ...params,
  });

  return fetch(`${stub.url}/login/oauth/authorize?${query}`, { redirect: 'manual' });
}

async function codeFor(login) {
  const response = await authorize(login === undefined ? {} : { login });

  return new URL(response.headers.get('location')).searchParams.get('code');
}

async function exchange(fields) {
  const response = await fetch(`${stub.url}/login/oauth/access_token`, {
    method: 'POST',
    headers: { accept: 'application/json' },
    body: new URLSearchParams({ client_id: 'client', client_secret: 'secret', code_verifier: VERIFIER, ...fields }),
  });

  return response.json();
}

async function tokenFor(login) {
  return (await exchange({ code: await codeFor(login) })).access_token;
}

const api = (path, token) =>
  fetch(`${stub.url}${path}`, token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } });

describe('pure helpers', () => {
  it('computes the RFC 7636 S256 challenge', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('derives a stable positive id and a lower-cased test email from the login', () => {
    expect(githubIdFor('mock-mentee')).toBe(githubIdFor('mock-mentee'));
    expect(githubIdFor('mock-mentee')).not.toBe(githubIdFor('mock-operator'));
    expect(Number.isSafeInteger(githubIdFor('x')) && githubIdFor('x') > 0).toBe(true);
    expect(emailFor('Mock-Operator')).toBe('mock-operator@devmentor.test');
  });

  it('round-trips a code and rejects malformed ones', () => {
    expect(decodeCode(encodeCode('octo', 'c'))).toEqual({ login: 'octo', challenge: 'c' });
    expect(decodeCode('%%%')).toBeNull();
    expect(decodeCode(Buffer.from('null').toString('base64url'))).toBeNull();
    expect(decodeCode(encodeCode('bad login', 'c'))).toBeNull();
    expect(decodeCode(Buffer.from(JSON.stringify({ login: 'octo', challenge: 1 })).toString('base64url'))).toBeNull();
  });
});

describe('GitHub stub server', () => {
  beforeEach(async () => {
    stub = await startGithubStub({ port: 0 });
  });

  afterEach(async () => {
    await stub.close();
  });

  describe('GET /login/oauth/authorize', () => {
    it('redirects straight back with a code and the state', async () => {
      const response = await authorize({ login: 'mock-operator' });
      const location = new URL(response.headers.get('location'));

      expect(response.status).toBe(302);
      expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
      expect(location.searchParams.get('state')).toBe('state-1');
      expect(decodeCode(location.searchParams.get('code'))).toEqual({ login: 'mock-operator', challenge: CHALLENGE });
    });

    it.each([
      ['no login hint', undefined],
      ['an invalid login hint', 'not valid!'],
    ])('uses the default persona for %s', async (_case, login) => {
      expect(decodeCode(await codeFor(login)).login).toBe(DEFAULT_LOGIN);
    });

    it('answers the deny persona with access_denied, like Cancel on GitHub', async () => {
      const location = new URL((await authorize({ login: 'deny' })).headers.get('location'));

      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('state')).toBe('state-1');
      expect(location.searchParams.has('code')).toBe(false);
    });

    it.each([
      ['redirect_uri', { redirect_uri: '' }],
      ['state', { state: '' }],
      ['client_id', { client_id: '' }],
      ['code_challenge', { code_challenge: '' }],
      ['an S256 method', { code_challenge_method: 'plain' }],
    ])('refuses a request without %s', async (_case, params) => {
      const response = await authorize(params);

      expect(response.status).toBe(400);
      expect(await response.text()).toContain('required');
    });

    it('answers 400 for a redirect_uri that is not a URL', async () => {
      const response = await authorize({ redirect_uri: 'not a url' });

      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(/URL/i);
    });
  });

  describe('POST /login/oauth/access_token', () => {
    it('issues a token for a code redeemed with the matching PKCE verifier', async () => {
      const body = await exchange({ code: await codeFor('mock-mentee') });

      expect(body).toEqual({ access_token: expect.stringMatching(/^stub-token-/), token_type: 'bearer', scope: 'read:user,user:email' });
    });

    it.each([
      ['a wrong verifier', { code_verifier: 'b'.repeat(43) }],
      ['no verifier', { code_verifier: '' }],
      ['a malformed code', { code: 'garbage' }],
    ])('answers bad_verification_code for %s', async (_case, fields) => {
      expect(await exchange({ code: await codeFor('mock-mentee'), ...fields })).toEqual({ error: 'bad_verification_code' });
    });

    it('answers bad_verification_code without a code', async () => {
      expect(await exchange({})).toEqual({ error: 'bad_verification_code' });
    });

    it.each([['client_id', { client_id: '' }], ['client_secret', { client_secret: '' }]])(
      'refuses a missing %s',
      async (_case, fields) => {
        expect(await exchange({ code: await codeFor('mock-mentee'), ...fields })).toEqual({ error: 'incorrect_client_credentials' });
      },
    );
  });

  describe('GET /user and /user/emails', () => {
    it('returns the persona with a stable id, a stub avatar and a verified primary email', async () => {
      const token = await tokenFor('mock-operator');
      const user = await (await api('/user', token)).json();
      const emails = await (await api('/user/emails', token)).json();

      expect(user).toEqual({ id: githubIdFor('mock-operator'), login: 'mock-operator', avatar_url: `${stub.url}/avatars/mock-operator.svg` });
      expect(emails).toEqual([{ email: 'mock-operator@devmentor.test', primary: true, verified: true, visibility: 'private' }]);
    });

    it('gives the unverified persona no verified email', async () => {
      const emails = await (await api('/user/emails', await tokenFor('mock-unverified'))).json();

      expect(emails[0].verified).toBe(false);
    });

    it.each([
      ['no token', undefined],
      ['a foreign token', 'gho_real'],
      ['a stub token with an invalid login', `stub-token-${Buffer.from('bad login').toString('base64url')}`],
    ])('answers 401 for %s', async (_case, token) => {
      const response = await api('/user', token);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ message: 'Requires authentication' });
    });
  });

  it('serves a generated avatar', async () => {
    const response = await fetch(`${stub.url}/avatars/mock-operator.svg`);

    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('>M</text>');
  });

  it.each([
    ['an unknown path', 'GET', '/repos'],
    ['a wrong method', 'POST', '/user'],
  ])('answers 404 for %s', async (_case, method, path) => {
    const response = await fetch(`${stub.url}${path}`, { method });

    expect(response.status).toBe(404);
  });
});

describe('startGithubStub', () => {
  it('checks the client credentials when they are configured', async () => {
    stub = await startGithubStub({ port: 0, clientId: 'client', clientSecret: 'secret' });

    try {
      const code = await codeFor('mock-mentee');

      expect(await exchange({ code })).toHaveProperty('access_token');
      expect(await exchange({ code, client_id: 'other' })).toEqual({ error: 'incorrect_client_credentials' });
      expect(await exchange({ code, client_secret: 'other' })).toEqual({ error: 'incorrect_client_credentials' });
    } finally {
      await stub.close();
    }
  });

  it('rejects when the port is taken', async () => {
    stub = await startGithubStub({ port: 0 });

    try {
      await expect(startGithubStub({ port: Number(new URL(stub.url).port) })).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await stub.close();
    }
  });
});

describe('main', () => {
  it('listens on GITHUB_STUB_PORT / GITHUB_STUB_HOST and prints how to use it', async () => {
    const log = vi.fn();
    const started = await main({ env: { GITHUB_STUB_PORT: '0', GITHUB_STUB_HOST: '127.0.0.1' }, log });

    try {
      expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(log.mock.calls[0][0]).toContain(started.url);
      expect(log.mock.calls[1][0]).toContain('mock-unverified');
    } finally {
      await started.close();
    }
  });

  it('defaults to port 3999 on 127.0.0.1 and console.log', async () => {
    vi.stubEnv('GITHUB_STUB_PORT', undefined);
    vi.stubEnv('GITHUB_STUB_HOST', undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const start = vi.fn(async () => ({ url: 'http://127.0.0.1:3999', close: vi.fn() }));

    try {
      await main({ start });

      expect(start).toHaveBeenCalledWith({ port: DEFAULT_PORT, host: '127.0.0.1' });
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
