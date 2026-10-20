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
