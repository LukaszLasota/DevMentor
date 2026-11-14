import type { MailMessage } from '../../mail/mail-sender';

/** Path of the page that sets the password from a verification link. */
export const VERIFY_EMAIL_PATH = '/verify-email';

/**
 * The verification link: `<APP_URL>/verify-email#token=<raw>[&returnTo=<path>]`. Both values travel
 * in the fragment, so they never reach a server log or a `Referer`; the page posts them back.
 * `returnTo` must already be a safe path (`safeReturnTo`) or be left out.
 */
export function verificationLink(appUrl: string, token: string, returnTo?: string): string {
  const fragment = new URLSearchParams({ token });

  if (returnTo !== undefined) {
    fragment.set('returnTo', returnTo);
  }

  return `${appUrl}${VERIFY_EMAIL_PATH}#${fragment.toString()}`;
}

/** Registration and resend: the link that sets the password. Never contains a password. */
export function registrationMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Finish your DevMentor registration',
    text: [
      'Set your password to finish creating your DevMentor account:',
      link,
      'The link works once and is valid for 24 hours.',
      'If you did not try to register, ignore this email. Nobody can sign in without the password you set.',
    ].join('\n\n'),
  };
}

/** Registration for an email that already has an account: nothing changes, the owner is told. */
export function alreadyRegisteredMail(to: string, appUrl: string): MailMessage {
  return {
    to,
    subject: 'Someone tried to register with your email',
    text: [
      'Someone, maybe you, tried to create a DevMentor account with this email. You already have an account, so nothing was changed.',
      `Sign in: ${appUrl}/sign-in`,
      `If you never finished your registration, enter this email at ${appUrl}/register and choose "Send a new link" on the next page.`,
      'If it was not you, you can ignore this email.',
    ].join('\n\n'),
  };
}
