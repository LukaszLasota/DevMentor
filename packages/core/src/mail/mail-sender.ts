import type { Cradle } from '../container/cradle';
import { LogMailer } from './log-mailer';
import { ResendMailer } from './resend-mailer';

/** One plain-text message; links (verification, invitations) travel in `text`. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends one message. Resolves only after the provider accepted it; any failure rejects with
 * `ServiceUnavailableError` (503), so callers never report a success without delivery.
 */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/**
 * Picks the adapter by `MAIL_PROVIDER` (the container's `mailSender` singleton). The log mailer only
 * writes to the app log, so it warns once when it is chosen: no email leaves the machine.
 */
export function createMailSender({ env, logger, fetchJson }: Pick<Cradle, 'env' | 'logger' | 'fetchJson'>): MailSender {
  if (env.MAIL_PROVIDER === 'resend') {
    return new ResendMailer({ env, logger, fetchJson });
  }

  logger.warn('MAIL_PROVIDER=log: emails are written to the app log (mail.sent), not delivered');

  return new LogMailer({ logger });
}
