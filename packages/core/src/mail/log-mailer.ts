import type { Cradle } from '../container/cradle';
import type { MailMessage, MailSender } from './mail-sender';

export const MAIL_SENT_MESSAGE = 'mail.sent';

/**
 * Development default and the integration-test path: one info line `mail.sent` with `to`, `subject`
 * and `text` (the harness reads the link from it). The keys are outside the logger's redact paths,
 * so the link in `text` stays readable — never use this mailer for real users.
 */
export class LogMailer implements MailSender {
  private readonly logger: Cradle['logger'];

  constructor({ logger }: Pick<Cradle, 'logger'>) {
    this.logger = logger;
  }

  async send({ to, subject, text }: MailMessage): Promise<void> {
    this.logger.info({ to, subject, text }, MAIL_SENT_MESSAGE);
  }
}
