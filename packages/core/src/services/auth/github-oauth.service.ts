import { z } from 'zod';
import type { Cradle } from '../../container/cradle';
import { AppError, ServiceUnavailableError } from '../../http/errors';
import { PKCE_METHOD } from '../../security/pkce';

/** Scopes we request: public profile and the email list (to find the verified primary email). */
export const GITHUB_SCOPE = 'read:user user:email';
export const GITHUB_CALLBACK_PATH = '/api/auth/github/callback';

// GitHub usernames: alphanumerics and hyphens, at most 39 characters. Anything else is dropped, not forwarded.
const LOGIN_HINT = /^[A-Za-z0-9-]{1,39}$/;
const GITHUB_API_VERSION = '2022-11-28';
// GitHub's REST API rejects requests without a User-Agent.
const USER_AGENT = 'DevMentor';

/**
 * GitHub returned no verified primary email. The account cannot be linked or created;
 * `redirectHandler` turns the code into `/sign-in?error=github_email_unverified`.
 */
export class GithubEmailUnverifiedError extends AppError {
  constructor(message = 'Your GitHub account has no verified primary email.', options?: ErrorOptions) {
    super(403, 'GITHUB_EMAIL_UNVERIFIED', message, options);
  }
}

export interface AuthorizeUrlInput {
  state: string;
  codeChallenge: string;
  /** Optional GitHub `login` hint; forwarded only when it is a valid GitHub username. */
  login?: string;
}

export interface ExchangeCodeInput {
  code: string;
  codeVerifier: string;
}

export interface GithubProfile {
  githubId: number;
  login: string;
  avatarUrl: string | null;
  /** Verified primary email, lower-cased. */
  email: string;
}

const tokenSuccessSchema = z.object({ access_token: z.string().min(1) });
// On failure GitHub answers 200 with e.g. `{ "error": "bad_verification_code" }`.
const tokenErrorSchema = z.object({ error: z.string() });

const userSchema = z.object({
  id: z.int().positive(),
  login: z.string().min(1),
  avatar_url: z.string().min(1).nullable().optional(),
});

const emailsSchema = z.array(
  z.object({
    email: z.string(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);

interface GithubCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Hand-written GitHub OAuth (authorization code + state + PKCE S256) over `fetchJson`.
 * Fails closed: missing configuration, a GitHub error response, an unexpected response shape,
 * a timeout or a non-2xx all throw `ServiceUnavailableError` (route: `github_unavailable`).
 * Never logs the code, the access token or response bodies.
 */
export class GithubOAuthService {
  private readonly env: Cradle['env'];
  private readonly fetchJson: Cradle['fetchJson'];
  private readonly logger: Cradle['logger'];

  constructor({ env, fetchJson, logger }: Pick<Cradle, 'env' | 'fetchJson' | 'logger'>) {
    this.env = env;
    this.fetchJson = fetchJson;
    this.logger = logger;
  }

  // Base URLs carry no trailing slash (env schema) and may have a path (test stub), so paths are appended.

  /** GitHub's authorize URL for a redirect from the start route. */
  buildAuthorizeUrl({ state, codeChallenge, login }: AuthorizeUrlInput): URL {
    const { clientId, redirectUri } = this.credentials();
    const url = new URL(`${this.env.DEVMENTOR_GITHUB_OAUTH_URL}/login/oauth/authorize`);

    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', GITHUB_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', PKCE_METHOD);

    if (login !== undefined && LOGIN_HINT.test(login)) {
      url.searchParams.set('login', login);
    }

    return url;
  }

  /** Exchanges the callback `code` (with the PKCE verifier) for an access token. */
  async exchangeCode({ code, codeVerifier }: ExchangeCodeInput): Promise<string> {
    const { clientId, clientSecret, redirectUri } = this.credentials();
    const body = await this.fetchJson<unknown>(`${this.env.DEVMENTOR_GITHUB_OAUTH_URL}/login/oauth/access_token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const success = tokenSuccessSchema.safeParse(body);

    if (success.success) {
      return success.data.access_token;
    }

    // GitHub's error identifier (e.g. `bad_verification_code`) is a fixed enum, safe to log.
    const failure = tokenErrorSchema.safeParse(body);
    this.logger.warn(
      { githubError: failure.success ? failure.data.error : 'unexpected_response' },
      'GitHub token exchange failed',
    );

    throw new ServiceUnavailableError('GitHub sign-in failed.');
  }

  /** Reads the user and their emails; requires a verified primary email. */
  async fetchProfile(accessToken: string): Promise<GithubProfile> {
    const headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': USER_AGENT,
      'x-github-api-version': GITHUB_API_VERSION,
    };
    const [userBody, emailsBody] = await Promise.all([
      this.fetchJson<unknown>(`${this.env.DEVMENTOR_GITHUB_API_URL}/user`, { headers }),
      this.fetchJson<unknown>(`${this.env.DEVMENTOR_GITHUB_API_URL}/user/emails`, { headers }),
    ]);

    const user = this.parse(userSchema, userBody, '/user');
    const emails = this.parse(emailsSchema, emailsBody, '/user/emails');
    const primary = emails.find((entry) => entry.primary && entry.verified);

    if (primary === undefined) {
      throw new GithubEmailUnverifiedError();
    }

    return {
      githubId: user.id,
      login: user.login,
      avatarUrl: user.avatar_url ?? null,
      email: primary.email.trim().toLowerCase(),
    };
  }

  private parse<T extends z.ZodType>(schema: T, body: unknown, endpoint: string): z.infer<T> {
    const result = schema.safeParse(body);

    if (!result.success) {
      // Issue paths only, never the body.
      this.logger.warn({ endpoint, issues: result.error.issues.map((issue) => issue.path.map(String).join('.')) }, 'Unexpected GitHub response');
      throw new ServiceUnavailableError('GitHub returned an unexpected response.');
    }

    return result.data;
  }

  private credentials(): GithubCredentials {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = this.env;

    if (GITHUB_CLIENT_ID === undefined || GITHUB_CLIENT_SECRET === undefined || APP_URL === undefined) {
      throw new ServiceUnavailableError('GitHub sign-in is not configured.');
    }

    return { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET, redirectUri: `${APP_URL}${GITHUB_CALLBACK_PATH}` };
  }
}
