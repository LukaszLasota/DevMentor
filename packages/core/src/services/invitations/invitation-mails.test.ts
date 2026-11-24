import { describe, expect, it } from 'vitest';
import { formatMailInstant, invitationMail } from './invitation-mails';

describe('invitationMail', () => {
  it('sends the link, its UTC expiry and the R13 ask to the invited address', () => {
    const link = 'https://app.devmentor.test/invitation/abc';
    const mail = invitationMail('ada@devmentor.test', link, new Date('2026-12-08T14:05:59.000Z'), 14);

    expect(mail.to).toBe('ada@devmentor.test');
    expect(mail.subject).toBe('You are invited to mentor on DevMentor');
    expect(mail.text.split('\n\n')).toEqual([
      'You are invited to mentor on DevMentor. Open this link to accept:',
      link,
      'The link works once and expires on 8 December 2026, 14:05 UTC.',
      'After you accept, publish at least one bookable session within 14 days.',
    ]);
  });
});

describe('formatMailInstant', () => {
  it('pads hours and minutes and names the month, in UTC', () => {
    expect(formatMailInstant(new Date('2026-01-03T04:07:00.000Z'))).toBe('3 January 2026, 04:07 UTC');
  });
});
