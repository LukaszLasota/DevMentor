// Local GitHub OAuth + REST stub for integration tests and local development (no real GitHub App).
// Serves the four endpoints `GithubOAuthService` calls; the app reaches it through
// DEVMENTOR_GITHUB_OAUTH_URL / DEVMENTOR_GITHUB_API_URL, which the app accepts only with ALLOW_TEST_OVERRIDES=1.
//
// Personas come from GitHub's `login` hint (`/api/auth/github?login=<persona>`):
// - any valid login → a user `<login>` with the verified primary email `<login>@devmentor.test`;
// - `<base>--<suffix>` → another GitHub account (own id) sharing `<base>`'s email (link races);
// - no hint → DEFAULT_LOGIN;
// - DENY_LOGIN → the user "cancels" on GitHub (`?error=access_denied`);
// - UNVERIFIED_LOGIN → the only email is not verified (`github_email_unverified`).
// Stateless: the code and the access token encode the persona, so the stub can restart mid-flow.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

export const DEFAULT_PORT = 3999;
export const DEFAULT_LOGIN = 'mock-mentee';
export const DENY_LOGIN = 'deny';
export const UNVERIFIED_LOGIN = 'mock-unverified';
export const EMAIL_DOMAIN = 'devmentor.test';

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const TOKEN_PREFIX = 'stub-token-';

const base64url = (value) => Buffer.from(value).toString('base64url');

/** RFC 7636 S256: base64url(sha256(verifier)). */
export function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Stable positive GitHub id per login (48 bits of its hash, so ids above 2^31 are exercised too). */
export function githubIdFor(login) {
  return Number.parseInt(createHash('sha256').update(login).digest('hex').slice(0, 12), 16) + 1;
}

/** Verified primary email; `<base>--<suffix>` shares `<base>`'s email (a different GitHub id). */
export function emailFor(login) {
  return `${login.toLowerCase().split('--')[0]}@${EMAIL_DOMAIN}`;
}

/** The authorization code carries the persona and the PKCE challenge it must be redeemed with. */
export function encodeCode(login, challenge) {
  return base64url(JSON.stringify({ login, challenge }));
}

export function decodeCode(code) {
  try {
    const value = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));

    return typeof value?.login === 'string' && LOGIN.test(value.login) && typeof value.challenge === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

function loginFromToken(authorization) {
  const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1] ?? '';
  const login = token.startsWith(TOKEN_PREFIX) ? Buffer.from(token.slice(TOKEN_PREFIX.length), 'base64url').toString('utf8') : '';

  return LOGIN.test(login) ? login : null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function readBody(req) {
  let body = '';

  for await (const chunk of req) body += chunk;

  return body;
}

/** `GET /login/oauth/authorize`: no consent screen, straight back to `redirect_uri`. */
function authorize(res, query) {
  const redirectUri = query.get('redirect_uri');
  const state = query.get('state');
  const challenge = query.get('code_challenge');

  if (!redirectUri || !state || !challenge || query.get('code_challenge_method') !== 'S256' || !query.get('client_id')) {
    sendText(res, 400, 'redirect_uri, state, client_id and an S256 code_challenge are required');
    return;
  }

  const login = query.get('login') ?? DEFAULT_LOGIN;
  const target = new URL(redirectUri);

  if (login === DENY_LOGIN) {
    target.searchParams.set('error', 'access_denied');
  } else {
    target.searchParams.set('code', encodeCode(LOGIN.test(login) ? login : DEFAULT_LOGIN, challenge));
  }

  target.searchParams.set('state', state);
  res.writeHead(302, { location: target.toString() });
  res.end();
}

/** `POST /login/oauth/access_token` (form body): GitHub answers errors with 200 `{ error }`. */
async function accessToken(req, res, { clientId, clientSecret }) {
  const form = new URLSearchParams(await readBody(req));
  const code = decodeCode(form.get('code') ?? '');
  const verifier = form.get('code_verifier');
  const clientOk =
    Boolean(form.get('client_id')) &&
    Boolean(form.get('client_secret')) &&
    (clientId === undefined || form.get('client_id') === clientId) &&
    (clientSecret === undefined || form.get('client_secret') === clientSecret);

  if (!clientOk) {
    sendJson(res, 200, { error: 'incorrect_client_credentials' });
  } else if (code === null || !verifier || pkceChallenge(verifier) !== code.challenge) {
    sendJson(res, 200, { error: 'bad_verification_code' });
  } else {
    sendJson(res, 200, { access_token: `${TOKEN_PREFIX}${base64url(code.login)}`, token_type: 'bearer', scope: 'read:user,user:email' });
  }
}

function avatarSvg(login) {
  const initial = login[0].toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#6b7280"/><text x="32" y="42" font-family="sans-serif" font-size="32" text-anchor="middle" fill="#fff">${initial}</text></svg>`;
}

/**
 * Request handler of the stub. `clientId` / `clientSecret`, when given, must match the token
 * exchange; otherwise any non-empty pair is accepted.
 */
export function createGithubStubHandler(options = {}) {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = `${req.method} ${url.pathname}`;

    try {
      if (route === 'GET /login/oauth/authorize') {
        authorize(res, url.searchParams);
        return;
      }

      if (route === 'POST /login/oauth/access_token') {
        await accessToken(req, res, options);
        return;
      }

      const avatar = /^GET \/avatars\/([A-Za-z0-9-]{1,39})\.svg$/.exec(route);

      if (avatar) {
        res.writeHead(200, { 'content-type': 'image/svg+xml' });
        res.end(avatarSvg(avatar[1]));
        return;
      }

      if (route !== 'GET /user' && route !== 'GET /user/emails') {
        sendJson(res, 404, { message: 'Not Found' });
        return;
      }

      const login = loginFromToken(req.headers.authorization);

      if (login === null) {
        sendJson(res, 401, { message: 'Requires authentication' });
      } else if (route === 'GET /user') {
        sendJson(res, 200, { id: githubIdFor(login), login, avatar_url: `${url.origin}/avatars/${login}.svg` });
      } else {
        sendJson(res, 200, [{ email: emailFor(login), primary: true, verified: login !== UNVERIFIED_LOGIN, visibility: 'private' }]);
      }
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
  };
}

/**
 * Starts the stub; resolves with its base URL (use it for both DEVMENTOR_GITHUB_OAUTH_URL and DEVMENTOR_GITHUB_API_URL).
 * Port 0 picks a free port.
 * @param {{ port?: number, host?: string, clientId?: string, clientSecret?: string }} [options]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function startGithubStub({ port = DEFAULT_PORT, host = '127.0.0.1', ...options } = {}) {
  const server = createServer(createGithubStubHandler(options));

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();

      resolve({
        url: `http://${host}:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/** `npm run github:stub`: port from GITHUB_STUB_PORT (default 3999); runs until stopped. */
export async function main({ env = process.env, log = console.log, start = startGithubStub } = {}) {
  const port = Number(env.GITHUB_STUB_PORT ?? DEFAULT_PORT);
  const stub = await start({ port, host: env.GITHUB_STUB_HOST ?? '127.0.0.1' });

  log(`GitHub stub on ${stub.url} — set DEVMENTOR_GITHUB_OAUTH_URL and DEVMENTOR_GITHUB_API_URL to it (with ALLOW_TEST_OVERRIDES=1).`);
  log(`Personas: /api/auth/github?login=<login> → <login>@${EMAIL_DOMAIN}; "${DENY_LOGIN}" cancels, "${UNVERIFIED_LOGIN}" has no verified email.`);

  return stub;
}
