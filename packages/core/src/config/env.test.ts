import { describe, expect, it, vi } from 'vitest';
import { assertProductionEnv, parseEnv } from './env';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';
const SECRET = 'a'.repeat(64);

describe('parseEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = parseEnv({ DATABASE_URL, DATABASE_POOL_MAX: '5' });

    expect(env).toEqual({
      NODE_ENV: 'development',
      DATABASE_URL,
      DATABASE_POOL_MIN: 0,
      DATABASE_POOL_MAX: 5,
      SESSION_SECRET: undefined,
      SESSION_SECRET_PREVIOUS: undefined,
      APP_URL: undefined,
      GITHUB_CLIENT_ID: undefined,
      GITHUB_CLIENT_SECRET: undefined,
      GITHUB_OAUTH_URL: 'https://github.com',
      GITHUB_API_URL: 'https://api.github.com',
      OPERATOR_EMAILS: [],
      TRUSTED_PROXY_HOPS: 0,
      PASSWORD_HASH_CONCURRENCY: 2,
      PASSWORD_HASH_WAIT_MS: 3000,
      INVITATION_TTL_DAYS: 14,
      MENTOR_PUBLISH_WINDOW_DAYS: 14,
      MAIL_PROVIDER: 'log',
      MAIL_API_KEY: undefined,
      MAIL_FROM: undefined,
      ALLOW_TEST_OVERRIDES: false,
    });
  });

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/postgres/);
  });

  it('never includes the offending value in the error', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://user:topsecret@localhost/db' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('topsecret') }),
    );
    expect(() => parseEnv({ DATABASE_URL, SESSION_SECRET: 'short-topsecret' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('topsecret') }),
    );
  });

  describe('session secrets', () => {
    it('accepts 64+ hex characters for the current and the previous secret', () => {
      const env = parseEnv({ DATABASE_URL, SESSION_SECRET: SECRET, SESSION_SECRET_PREVIOUS: `${'B'.repeat(64)}00` });

      expect(env.SESSION_SECRET).toBe(SECRET);
      expect(env.SESSION_SECRET_PREVIOUS).toBe(`${'B'.repeat(64)}00`);
    });

    it('rejects secrets that are too short or not hex', () => {
      expect(() => parseEnv({ DATABASE_URL, SESSION_SECRET: 'a'.repeat(63) })).toThrow(/64 hex[\s\S]*at SESSION_SECRET/);
      expect(() => parseEnv({ DATABASE_URL, SESSION_SECRET_PREVIOUS: 'z'.repeat(64) })).toThrow(
        /SESSION_SECRET_PREVIOUS/,
      );
    });

    it('treats an empty value from a dotenv file as not set', () => {
      expect(parseEnv({ DATABASE_URL, SESSION_SECRET: '', APP_URL: '' })).toMatchObject({
        SESSION_SECRET: undefined,
        APP_URL: undefined,
      });
    });
  });

  describe('APP_URL', () => {
    it('accepts an absolute http(s) URL and strips trailing slashes', () => {
      expect(parseEnv({ DATABASE_URL, APP_URL: 'https://devmentor.example/' }).APP_URL).toBe(
        'https://devmentor.example',
      );
      expect(parseEnv({ DATABASE_URL, APP_URL: 'http://localhost:3000' }).APP_URL).toBe('http://localhost:3000');
    });

    it('rejects relative and non-http URLs', () => {
      expect(() => parseEnv({ DATABASE_URL, APP_URL: '/relative' })).toThrow(/APP_URL/);
      expect(() => parseEnv({ DATABASE_URL, APP_URL: 'ftp://devmentor.example' })).toThrow(/APP_URL/);
    });
  });

  describe('GitHub', () => {
    it('keeps the OAuth client credentials optional (checked at the route)', () => {
      expect(parseEnv({ DATABASE_URL, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' })).toMatchObject({
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'secret',
      });
    });

    it('refuses override URLs without ALLOW_TEST_OVERRIDES=1', () => {
      expect(() => parseEnv({ DATABASE_URL, GITHUB_OAUTH_URL: 'http://127.0.0.1:4000' })).toThrow(
        /ALLOW_TEST_OVERRIDES=1[\s\S]*at GITHUB_OAUTH_URL/,
      );
      expect(() =>
        parseEnv({ DATABASE_URL, GITHUB_API_URL: 'http://127.0.0.1:4000', ALLOW_TEST_OVERRIDES: '0' }),
      ).toThrow(/ALLOW_TEST_OVERRIDES=1[\s\S]*at GITHUB_API_URL/);
    });

    it('accepts override URLs with ALLOW_TEST_OVERRIDES=1', () => {
      const env = parseEnv({
        DATABASE_URL,
        ALLOW_TEST_OVERRIDES: '1',
        GITHUB_OAUTH_URL: 'http://127.0.0.1:4000/',
        GITHUB_API_URL: 'http://127.0.0.1:4000/api',
      });

      expect(env).toMatchObject({
        ALLOW_TEST_OVERRIDES: true,
        GITHUB_OAUTH_URL: 'http://127.0.0.1:4000',
        GITHUB_API_URL: 'http://127.0.0.1:4000/api',
      });
    });

    it('rejects an ALLOW_TEST_OVERRIDES value other than 0 or 1', () => {
      expect(() => parseEnv({ DATABASE_URL, ALLOW_TEST_OVERRIDES: 'true' })).toThrow(/ALLOW_TEST_OVERRIDES/);
    });
  });

  describe('OPERATOR_EMAILS', () => {
    it('splits, trims and lower-cases the list and drops empty entries', () => {
      expect(
        parseEnv({ DATABASE_URL, OPERATOR_EMAILS: ' Founder@DevMentor.test, ,mock-operator@devmentor.test,' })
          .OPERATOR_EMAILS,
      ).toEqual(['founder@devmentor.test', 'mock-operator@devmentor.test']);
    });

    it('means no operator when empty', () => {
      expect(parseEnv({ DATABASE_URL, OPERATOR_EMAILS: '' }).OPERATOR_EMAILS).toEqual([]);
    });

    it('rejects an entry that is not an email address', () => {
      expect(() => parseEnv({ DATABASE_URL, OPERATOR_EMAILS: 'ok@devmentor.test,not-an-email' })).toThrow(
        /OPERATOR_EMAILS/,
      );
    });
  });

  describe('TRUSTED_PROXY_HOPS and the hashing gate', () => {
    it('coerces the values and treats empty ones as defaults', () => {
      expect(
        parseEnv({ DATABASE_URL, TRUSTED_PROXY_HOPS: '1', PASSWORD_HASH_CONCURRENCY: '4', PASSWORD_HASH_WAIT_MS: '0' }),
      ).toMatchObject({ TRUSTED_PROXY_HOPS: 1, PASSWORD_HASH_CONCURRENCY: 4, PASSWORD_HASH_WAIT_MS: 0 });
      expect(
        parseEnv({ DATABASE_URL, TRUSTED_PROXY_HOPS: '', PASSWORD_HASH_CONCURRENCY: '', PASSWORD_HASH_WAIT_MS: '' }),
      ).toMatchObject({ TRUSTED_PROXY_HOPS: 0, PASSWORD_HASH_CONCURRENCY: 2, PASSWORD_HASH_WAIT_MS: 3000 });
    });

    it.each([
      ['TRUSTED_PROXY_HOPS', '-1'],
      ['TRUSTED_PROXY_HOPS', '1.5'],
      ['PASSWORD_HASH_CONCURRENCY', '0'],
      ['PASSWORD_HASH_WAIT_MS', 'soon'],
    ])('rejects %s=%s', (key, value) => {
      expect(() => parseEnv({ DATABASE_URL, [key]: value })).toThrow(new RegExp(key));
    });
  });

  describe('invitation windows', () => {
    it('coerces whole days and treats empty values as the 14-day defaults', () => {
      expect(parseEnv({ DATABASE_URL, INVITATION_TTL_DAYS: '7', MENTOR_PUBLISH_WINDOW_DAYS: '30' })).toMatchObject({
        INVITATION_TTL_DAYS: 7,
        MENTOR_PUBLISH_WINDOW_DAYS: 30,
      });
      expect(parseEnv({ DATABASE_URL, INVITATION_TTL_DAYS: '', MENTOR_PUBLISH_WINDOW_DAYS: '' })).toMatchObject({
        INVITATION_TTL_DAYS: 14,
        MENTOR_PUBLISH_WINDOW_DAYS: 14,
      });
    });

    it.each([
      ['INVITATION_TTL_DAYS', '0'],
      ['INVITATION_TTL_DAYS', '-3'],
      ['INVITATION_TTL_DAYS', '1.5'],
      ['INVITATION_TTL_DAYS', '366'],
      ['MENTOR_PUBLISH_WINDOW_DAYS', '0'],
      ['MENTOR_PUBLISH_WINDOW_DAYS', 'two weeks'],
    ])('rejects %s=%s', (key, value) => {
      expect(() => parseEnv({ DATABASE_URL, [key]: value })).toThrow(new RegExp(key));
    });
  });

  describe('mail', () => {
    it('defaults MAIL_PROVIDER to log in development and test, resend in production', () => {
      expect(parseEnv({ DATABASE_URL, NODE_ENV: 'development' }).MAIL_PROVIDER).toBe('log');
      expect(parseEnv({ DATABASE_URL, NODE_ENV: 'test', MAIL_PROVIDER: '' }).MAIL_PROVIDER).toBe('log');
      expect(parseEnv({ DATABASE_URL, NODE_ENV: 'production' }).MAIL_PROVIDER).toBe('resend');
    });

    it('keeps an explicit provider and the optional key and sender', () => {
      expect(
        parseEnv({ DATABASE_URL, MAIL_PROVIDER: 'resend', MAIL_API_KEY: 're_x', MAIL_FROM: 'DevMentor <a@b.test>' }),
      ).toMatchObject({ MAIL_PROVIDER: 'resend', MAIL_API_KEY: 're_x', MAIL_FROM: 'DevMentor <a@b.test>' });
      expect(parseEnv({ DATABASE_URL, MAIL_API_KEY: '', MAIL_FROM: '' })).toMatchObject({
        MAIL_API_KEY: undefined,
        MAIL_FROM: undefined,
      });
    });

    it('rejects an unknown provider', () => {
      expect(() => parseEnv({ DATABASE_URL, MAIL_PROVIDER: 'smtp' })).toThrow(/MAIL_PROVIDER/);
    });

    it('refuses MAIL_PROVIDER=log in production without ALLOW_TEST_OVERRIDES=1', () => {
      expect(() => parseEnv({ DATABASE_URL, NODE_ENV: 'production', MAIL_PROVIDER: 'log' })).toThrow(
        /MAIL_PROVIDER=log in production requires ALLOW_TEST_OVERRIDES=1/,
      );
      expect(
        parseEnv({ DATABASE_URL, NODE_ENV: 'production', MAIL_PROVIDER: 'log', ALLOW_TEST_OVERRIDES: '1' })
          .MAIL_PROVIDER,
      ).toBe('log');
    });
  });
});

describe('assertProductionEnv', () => {
  it('passes outside production even without auth values', () => {
    expect(() => assertProductionEnv(parseEnv({ DATABASE_URL, NODE_ENV: 'test' }))).not.toThrow();
  });

  it('lists the missing keys in production', () => {
    expect(() => assertProductionEnv(parseEnv({ DATABASE_URL, NODE_ENV: 'production' }))).toThrow(
      'Invalid environment: SESSION_SECRET, APP_URL, MAIL_API_KEY, MAIL_FROM must be set in production',
    );
    expect(() =>
      assertProductionEnv(
        parseEnv({ DATABASE_URL, NODE_ENV: 'production', SESSION_SECRET: SECRET, MAIL_API_KEY: 're_x', MAIL_FROM: 'a@b.test' }),
      ),
    ).toThrow('Invalid environment: APP_URL must be set in production');
  });

  it('passes in production with SESSION_SECRET, APP_URL and the resend key and sender', () => {
    const env = parseEnv({
      DATABASE_URL,
      NODE_ENV: 'production',
      SESSION_SECRET: SECRET,
      APP_URL: 'https://x.test',
      MAIL_API_KEY: 're_x',
      MAIL_FROM: 'a@b.test',
    });

    expect(() => assertProductionEnv(env)).not.toThrow();
  });

  it('does not require the resend key when the log mailer is legitimately set', () => {
    const env = parseEnv({
      DATABASE_URL,
      NODE_ENV: 'production',
      SESSION_SECRET: SECRET,
      APP_URL: 'https://x.test',
      MAIL_PROVIDER: 'log',
      ALLOW_TEST_OVERRIDES: '1',
    });

    expect(() => assertProductionEnv(env)).not.toThrow();
  });
});

describe('getEnv', () => {
  it('parses process.env once and caches the result', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', DATABASE_URL);
    const { getEnv } = await import('./env');

    const first = getEnv();
    vi.stubEnv('DATABASE_URL', 'postgres://changed@localhost/other');

    expect(first.DATABASE_URL).toBe(DATABASE_URL);
    expect(getEnv()).toBe(first);
    vi.unstubAllEnvs();
  });
});
