import { z } from 'zod';
import type { Cradle } from '../container/cradle';
import { ServiceUnavailableError } from '../http/errors';
import type { MailMessage, MailSender } from './mail-sender';

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

// Resend answers an accepted message with its id; anything else is not a confirmed delivery.
const acceptedSchema = z.object({ id: z.string().min(1) });

/**
 * Resend's HTTP API over `fetchJson` (timeout, network failure, non-2xx → 503). Missing
 * `MAIL_API_KEY`/`MAIL_FROM` or an unexpected response also fail with 503: never a reported success
 * without delivery. Logs neither the key nor the message (recipient, subject, body).
 */
export class ResendMailer implements MailSender {
  private readonly env: Cradle['env'];
  private readonly logger: Cradle['logger'];
  private readonly fetchJson: Cradle['fetchJson'];

  constructor({ env, logger, fetchJson }: Pick<Cradle, 'env' | 'logger' | 'fetchJson'>) {
    this.env = env;
    this.logger = logger;
    this.fetchJson = fetchJson;
  }

  async send({ to, subject, text }: MailMessage): Promise<void> {
    const { MAIL_API_KEY: apiKey, MAIL_FROM: from } = this.env;

    if (apiKey === undefined || from === undefined) {
      this.logger.warn('Mail delivery is not configured: MAIL_API_KEY and MAIL_FROM are required for resend');
      throw new ServiceUnavailableError('Mail delivery is unavailable.');
    }

    const body = await this.fetchJson<unknown>(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });

    const accepted = acceptedSchema.safeParse(body);

    if (!accepted.success) {
      this.logger.warn({ upstream: { url: RESEND_EMAILS_URL } }, 'Resend returned an unexpected response');
      throw new ServiceUnavailableError('Mail delivery is unavailable.');
    }

    this.logger.info({ mail: { provider: 'resend', id: accepted.data.id } }, 'Mail accepted by Resend');
  }
}
