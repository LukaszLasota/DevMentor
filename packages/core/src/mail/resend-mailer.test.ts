import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { isAppError, ServiceUnavailableError } from '../http/errors';
import { createFetchJson, type FetchJsonInit } from '../http/outbound';
import { createLogger } from '../logger';
import { RESEND_EMAILS_URL, ResendMailer } from './resend-mailer';

const API_KEY = 're_secret_key_123';
const FROM = 'DevMentor <noreply@devmentor.test>';
const MESSAGE = { to: 'ada@devmentor.test', subject: 'Finish your registration', text: 'Open https://x.test/verify-email#token=t0k3n' };
const BASE_ENV = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', MAIL_PROVIDER: 'resend', MAIL_API_KEY: API_KEY, MAIL_FROM: FROM };

function setup(impl: (url: string, init: FetchJsonInit) => Promise<unknown>, envOverrides: Record<string, string> = {}) {
  const env = parseEnv({ ...BASE_ENV, ...envOverrides });
  const fetchJson = vi.fn((url: string | URL, init?: FetchJsonInit) => impl(String(url), init ?? {}));
  const logger = { info: vi.fn(), warn: vi.fn() };
  const mailer = new ResendMailer({
    env,
    logger: logger as unknown as Cradle['logger'],
    fetchJson: fetchJson as unknown as Cradle['fetchJson'],
  });

  return { mailer, fetchJson, logger };
}

/** A mailer over the real `fetchJson` and logger, with `fetch` stubbed; returns the written log lines. */
function realStack(fetchImpl: typeof fetch) {
  const lines: string[] = [];
  const logger = createLogger(
    new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    }),
  );
  logger.level = 'info';
  const mailer = new ResendMailer({
    env: parseEnv(BASE_ENV),
    logger,
    fetchJson: createFetchJson({ logger, fetch: fetchImpl }),
  });

  return { mailer, lines };
}

describe('ResendMailer', () => {
  it('posts the message to Resend with the bearer key and MAIL_FROM', async () => {
    const { mailer, fetchJson, logger } = setup(async () => ({ id: 'email-1' }));

    await expect(mailer.send(MESSAGE)).resolves.toBeUndefined();

    expect(fetchJson).toHaveBeenCalledTimes(1);
    const [url, init] = fetchJson.mock.calls[0];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual({ from: FROM, to: [MESSAGE.to], subject: MESSAGE.subject, text: MESSAGE.text });
    expect(logger.info).toHaveBeenCalledWith({ mail: { provider: 'resend', id: 'email-1' } }, 'Mail accepted by Resend');
  });

  it.each([
    ['MAIL_API_KEY', { MAIL_API_KEY: '' }],
    ['MAIL_FROM', { MAIL_FROM: '' }],
  ])('fails with 503 without calling Resend when %s is missing', async (_key, overrides) => {
    const { mailer, fetchJson, logger } = setup(async () => ({ id: 'never' }), overrides);

    await expect(mailer.send(MESSAGE)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MAIL_API_KEY and MAIL_FROM'));
  });

  it('passes on the 503 of fetchJson (non-2xx, timeout, network)', async () => {
    const upstream = new ServiceUnavailableError('An upstream service is unavailable.');
    const { mailer, logger } = setup(async () => {
      throw upstream;
    });

    await expect(mailer.send(MESSAGE)).rejects.toBe(upstream);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body', {}],
    ['an error-shaped body', { name: 'validation_error', message: 'bad' }],
    ['a non-object', null],
  ])('treats a 2xx with %s as not delivered (503)', async (_case, body) => {
    const { mailer, logger } = setup(async () => body);

    await expect(mailer.send(MESSAGE)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(logger.warn).toHaveBeenCalledWith({ upstream: { url: RESEND_EMAILS_URL } }, 'Resend returned an unexpected response');
    expect(logger.info).not.toHaveBeenCalled();
  });

  describe('over the real fetchJson', () => {
    it('maps a non-2xx answer to 503 and logs neither the key nor the message', async () => {
      const { mailer, lines } = realStack(async () => new Response(JSON.stringify({ message: `bad key ${API_KEY}` }), { status: 401 }));

      const error = await mailer.send(MESSAGE).catch((caught: unknown) => caught);

      expect(isAppError(error) && error.status).toBe(503);
      const log = lines.join('');
      expect(log).toContain('"status":401');
      for (const secret of [API_KEY, MESSAGE.to, MESSAGE.subject, 't0k3n']) expect(log).not.toContain(secret);
    });

    it('maps a timeout to 503', async () => {
      const { mailer } = realStack(async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      });

      await expect(mailer.send(MESSAGE)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    });
  });
});
