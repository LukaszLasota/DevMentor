import { readFile } from 'node:fs/promises';
import { inject } from 'vitest';

// Mails of the log mailer (`MAIL_PROVIDER=log`): pino JSON lines with msg `mail.sent` (MAIL_SENT_MESSAGE in
// @devmentor/core) and `to`, `subject`, `text`, in the app log file global-setup writes at LOG_LEVEL=info.
const MAIL_SENT_MESSAGE = 'mail.sent';
const POLL_MS = 100;
const TIMEOUT_MS = 10_000;

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

function parse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined; // Next's own banner lines are not JSON.
  }
}

/** Every mail the app has logged to `to`, oldest first. */
export async function mailsTo(to: string): Promise<SentMail[]> {
  const log = await readFile(inject('appLogFile'), 'utf8');

  return log
    .split('\n')
    .map(parse)
    .filter((entry): entry is SentMail & { msg: string } => {
      const record = entry as { msg?: unknown; to?: unknown } | undefined;
      return record?.msg === MAIL_SENT_MESSAGE && record.to === to;
    })
    .map(({ to: recipient, subject, text }) => ({ to: recipient, subject, text }));
}

/** Waits until `to` has received `count` mails and returns the latest. */
export async function waitForMail(to: string, count = 1): Promise<SentMail> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const mails = await mailsTo(to);
    const latest = mails[count - 1] ? mails[mails.length - 1] : undefined;

    if (latest) return latest;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  throw new Error(`No mail #${count} to ${to} in the app log within ${TIMEOUT_MS} ms`);
}

/** The verification link (`<APP_URL>/verify-email#token=…[&returnTo=…]`) in a mail's text. */
export function verificationLinkIn(mail: SentMail): string {
  const link = /\bhttps?:\/\/\S+\/verify-email#\S+/.exec(mail.text)?.[0];

  if (!link) throw new Error(`No verification link in "${mail.subject}"`);
  return link;
}
