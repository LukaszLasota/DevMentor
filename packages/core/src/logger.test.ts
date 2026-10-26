import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });

  return { lines, logger: createLogger(stream) };
}

describe('logger', () => {
  it('redacts credentials at the top level and one level deep', () => {
    const { lines, logger } = capture();
    logger.level = 'info';

    logger.info({ password: 'p1', user: { token: 't1' }, headers: { authorization: 'Bearer x', cookie: 'c' } }, 'login');

    const entry = JSON.parse(lines[0]);
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.user.token).toBe('[REDACTED]');
    expect(entry.headers).toEqual({ authorization: '[REDACTED]', cookie: '[REDACTED]' });
    expect(lines[0]).not.toMatch(/p1|t1|Bearer/);
  });

  it('redacts OAuth codes, cookies and auth headers, also on a nested request', () => {
    const { lines, logger } = capture();
    logger.level = 'info';

    logger.info(
      {
        code: 'oauth-code-1',
        query: { code: 'oauth-code-2', state: 'kept' },
        cookie: 'dm_session=c1',
        authorization: 'Bearer a1',
        headers: { 'set-cookie': 'dm_session=c2' },
        req: { headers: { authorization: 'Bearer a2', cookie: 'dm_session=c3', 'set-cookie': 'c4' } },
      },
      'callback',
    );

    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      code: '[REDACTED]',
      query: { code: '[REDACTED]', state: 'kept' },
      cookie: '[REDACTED]',
      authorization: '[REDACTED]',
      headers: { 'set-cookie': '[REDACTED]' },
      req: { headers: { authorization: '[REDACTED]', cookie: '[REDACTED]', 'set-cookie': '[REDACTED]' } },
    });
    expect(lines[0]).not.toMatch(/oauth-code|dm_session|Bearer|c4/);
  });
});

describe('logger err.code', () => {
  it('keeps the code of a logged error but still redacts its credentials and other codes', () => {
    const { lines, logger } = capture();
    logger.level = 'info';
    const err = Object.assign(new Error('duplicate key'), { code: '23505', password: 'p2' });

    logger.error({ err, code: 'oauth-code-1', query: { code: 'oauth-code-2' }, error: { code: 'oauth-code-3' } }, 'failed');

    const entry = JSON.parse(lines[0]);
    expect(entry.err).toMatchObject({ type: 'Error', message: 'duplicate key', code: '23505', password: '[REDACTED]' });
    expect(entry).toMatchObject({ code: '[REDACTED]', query: { code: '[REDACTED]' }, error: { code: '[REDACTED]' } });
    expect(lines[0]).not.toMatch(/oauth-code|p2/);
  });
});

describe('logger level', () => {
  it('uses LOG_LEVEL when set and info otherwise', async () => {
    vi.stubEnv('LOG_LEVEL', 'warn');
    expect(createLogger().level).toBe('warn');

    vi.stubEnv('LOG_LEVEL', undefined);
    expect(createLogger().level).toBe('info');
    vi.unstubAllEnvs();
  });

  it('exports a ready-to-use logger instance', async () => {
    const { logger } = await import('./logger');

    expect(typeof logger.info).toBe('function');
  });
});
