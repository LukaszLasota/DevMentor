import { describe, expect, it } from 'vitest';
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
