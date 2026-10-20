import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', DATABASE_POOL_MAX: '5' });

    expect(env).toEqual({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      DATABASE_POOL_MIN: 0,
      DATABASE_POOL_MAX: 5,
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
  });
});

describe('getEnv', () => {
  it('parses process.env once and caches the result', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    const { getEnv } = await import('./env');

    const first = getEnv();
    vi.stubEnv('DATABASE_URL', 'postgres://changed@localhost/other');

    expect(first.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db');
    expect(getEnv()).toBe(first);
    vi.unstubAllEnvs();
  });
});
