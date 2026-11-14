import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../logger';
import { LogMailer, MAIL_SENT_MESSAGE } from './log-mailer';

describe('LogMailer', () => {
  it('writes one mail.sent line with to, subject and text, the link not redacted by the real logger', async () => {
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
    const text = 'Set your password: https://app.devmentor.test/verify-email#token=abc_DEF-123\n\nThe link is valid for 24 hours.';

    await new LogMailer({ logger }).send({ to: 'ada@devmentor.test', subject: 'Finish your registration', text });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: 30,
      msg: MAIL_SENT_MESSAGE,
      to: 'ada@devmentor.test',
      subject: 'Finish your registration',
      text,
    });
    expect(lines[0]).not.toContain('[REDACTED]');
  });
});
