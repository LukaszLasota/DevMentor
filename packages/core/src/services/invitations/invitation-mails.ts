import type { MailMessage } from '../../mail/mail-sender';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (value: number) => String(value).padStart(2, '0');

/** `8 December 2026, 14:05 UTC`: an email has no viewer time zone, so times are UTC. */
export function formatMailInstant(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * The invitation email (spec 2026-11-24-invitation-batches): the link (the only place the raw token
 * travels), its expiry and the R13 ask. Plain text, like `account-mails.ts`.
 */
export function invitationMail(to: string, link: string, expiresAt: Date, windowDays: number): MailMessage {
  return {
    to,
    subject: 'You are invited to mentor on DevMentor',
    text: [
      'You are invited to mentor on DevMentor. Open this link to accept:',
      link,
      `The link works once and expires on ${formatMailInstant(expiresAt)}.`,
      `After you accept, publish at least one bookable session within ${windowDays} days.`,
    ].join('\n\n'),
  };
}
