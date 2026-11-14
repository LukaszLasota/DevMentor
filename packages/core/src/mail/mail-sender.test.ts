import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import type { Cradle } from '../container/cradle';
import { LogMailer } from './log-mailer';
import { createMailSender } from './mail-sender';
import { ResendMailer } from './resend-mailer';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';

function deps(env: Record<string, string>) {
  const logger = { info: vi.fn(), warn: vi.fn() };

  return {
    logger,
    deps: {
      env: parseEnv({ DATABASE_URL, ...env }),
      logger: logger as unknown as Cradle['logger'],
      fetchJson: vi.fn() as unknown as Cradle['fetchJson'],
    },
  };
}

describe('createMailSender', () => {
  it('chooses the Resend mailer for MAIL_PROVIDER=resend, without a warning', () => {
    const { deps: input, logger } = deps({ MAIL_PROVIDER: 'resend' });

    expect(createMailSender(input)).toBeInstanceOf(ResendMailer);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('chooses the log mailer (development default) and warns that mail is not delivered', () => {
    const { deps: input, logger } = deps({ NODE_ENV: 'development' });

    expect(createMailSender(input)).toBeInstanceOf(LogMailer);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MAIL_PROVIDER=log'));
  });
});
