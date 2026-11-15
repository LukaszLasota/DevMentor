import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { verificationLinkIn, waitForMail } from './mail';
import { psql } from './psql';

// Email registration in the browser (s01, s03, s04): register → link from the log mailer → set the password
// (Show password) → signed in on returnTo → sign out → sign in with email and password; wrong password and
// rate-limit copy; a used link. Tests share one browser session and run in order.
const baseUrl = inject('baseUrl');
const browser = createAgentBrowser(`devmentor-email-${process.pid}`);
const PASSWORD = 'correct horse battery staple';
const RETURN_TO = '/mentors?from=register';
const EMAIL = `reg-${randomUUID().slice(0, 8)}@devmentor.test`;
const TYPO = EMAIL.replace('@devmentor.test', '@devmentor.tset');
const EMAIL_INPUT = 'input[name="email"]';
const PASSWORD_INPUT = 'input[name="password"]';

async function signInWithEmail(email: string, password: string) {
  await browser.waitForIdle();
  await browser.fill(EMAIL_INPUT, email);
  await browser.fill(PASSWORD_INPUT, password);
  await browser.clickButton('Sign in');
}

describe('email registration and password sign-in (agent-browser)', () => {
  let link = '';

  afterAll(async () => {
    await browser.close();
  });

  it('registers from /sign-in with returnTo; "Use a different email" brings the typed address back', async () => {
    await browser.open(`${baseUrl}/sign-in?${new URLSearchParams({ returnTo: RETURN_TO })}`);
    await browser.waitForText('Sign in to DevMentor');
    await browser.waitForIdle();
    await browser.click('a[href^="/register"]');
    await browser.waitForUrl('**/register?returnTo=*');
    await browser.waitForText('Create an account');
    await browser.waitForIdle();

    await browser.fill(EMAIL_INPUT, TYPO);
    await browser.clickButton('Send link');
    await browser.waitForText('Check your inbox to finish registration');
    await browser.clickButton('Use a different email');
    expect(await browser.value(EMAIL_INPUT)).toBe(TYPO);

    await browser.fill(EMAIL_INPUT, EMAIL);
    await browser.clickButton('Send link');
    await browser.waitForText(`We sent an email to ${EMAIL}.`);

    const mail = await waitForMail(EMAIL);
    link = verificationLinkIn(mail);

    expect(mail.subject).toBe('Finish your DevMentor registration');
    expect(new URLSearchParams(new URL(link).hash.slice(1)).get('returnTo')).toBe(RETURN_TO);
  });

  it('serves /verify-email with Referrer-Policy: no-referrer', async () => {
    const res = await fetch(`${baseUrl}/verify-email`);

    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await res.text()).toContain('<meta name="referrer" content="no-referrer"/>');
  });

  it('sets the password from the link (Show password) and lands signed in on returnTo', async () => {
    await browser.open(link);
    await browser.waitForText('Set your password');
    await browser.waitForIdle();

    await browser.fill(PASSWORD_INPUT, PASSWORD);
    expect(await browser.attr(PASSWORD_INPUT, 'type')).toBe('password');
    await browser.click('button[role="checkbox"]');
    expect(await browser.attr(PASSWORD_INPUT, 'type')).toBe('text');

    await browser.clickButton('Set password and sign in');
    await browser.waitForUrl('**/mentors?from=register');
    await browser.waitForText(EMAIL);

    expect(await psql(`select email_verified_at is not null and password_hash is not null from users where email = '${EMAIL}'`)).toBe('t');
  });

  it('shows "This link does not work any more" when the used link is submitted, with a resend form', async () => {
    // There is no lookup endpoint: the link is checked when the password is posted, and nothing changes.
    await browser.open(link);
    await browser.waitForText('Set your password');
    await browser.waitForIdle();
    await browser.fill(PASSWORD_INPUT, 'another long password');
    await browser.clickButton('Set password and sign in');
    await browser.waitForText('This link does not work any more');

    expect(await browser.count(EMAIL_INPUT)).toBe(1);
  });

  it('signs out, refuses a wrong password, then signs in with email and password', async () => {
    await browser.open(`${baseUrl}/mentors`);
    await browser.waitForText(EMAIL);
    await browser.waitForIdle();
    await browser.clickButton('Sign out');
    await browser.waitForUrl('**/sign-in');
    await browser.waitForText('Sign in to DevMentor');

    await signInWithEmail(EMAIL, 'not the password');
    await browser.waitForText('Invalid email or password.');

    await browser.fill(PASSWORD_INPUT, PASSWORD);
    await browser.clickButton('Sign in');
    await browser.waitForUrl('**/mentors');
    await browser.waitForText(EMAIL);
  });

  it('shows the 429 copy on the 6th attempt for one email', async () => {
    const email = `limited-${randomUUID().slice(0, 8)}@devmentor.test`;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-devmentor-request': '1' },
        body: JSON.stringify({ email, password: 'wrong password' }),
      });
      expect(res.status, `attempt ${attempt}`).toBe(401);
    }

    await browser.waitForIdle();
    await browser.clickButton('Sign out');
    await browser.waitForUrl('**/sign-in');
    await browser.waitForText('Sign in to DevMentor');
    await signInWithEmail(email, 'wrong password');
    await browser.waitForText('Too many attempts. Try again in 15 minutes.');
  });
});
