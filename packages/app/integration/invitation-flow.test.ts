import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { verificationLinkIn, waitForMail } from './mail';
import { psql } from './psql';
import { redirectTarget } from './redirect';

// Mentor invitations end to end (spec 2026-10-21-mentor-invitations, step 8): the operator's
// `npm run invite` logic (`runInviteCli`) runs in this process against the test database and prints
// the link; the browser opens it signed out, signs in through the GitHub stub (persona
// `<login>@devmentor.test`) or registers by email, accepts and lands on /mentor still signed in.
// Personas are unique per run so the seed test's demo accounts never collide. Tests share one
// browser session and run in order.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const { runInviteCli } = await import('@devmentor/core/cli');
const baseUrl = inject('baseUrl');
const browser = createAgentBrowser(`devmentor-invitation-flow-${process.pid}`);
const run = randomUUID().slice(0, 8);
const INVITED_LOGIN = `inv-mentor-${run}`;
const OTHER_LOGIN = `inv-other-${run}`;
const INVITED = `${INVITED_LOGIN}@devmentor.test`;
const OTHER = `${OTHER_LOGIN}@devmentor.test`;
const REGISTERED = `inv-email-${run}@devmentor.test`;
const MISMATCH_INVITED = `inv-elsewhere-${run}@devmentor.test`;
const PASSWORD = 'correct horse battery staple';
const PUBLISH_BY = 'Publish at least one bookable session by';
const MAIN_NAV = 'nav[aria-label="Main"]';

interface Created {
  link: string;
  token: string;
  id: string;
}

/** `npm run invite -- <argv>` in-process; fails the test on a non-zero exit. */
async function invite(...argv: string[]): Promise<string> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runInviteCli({ argv, stdout: (text) => out.push(text), stderr: (text) => err.push(text) });

  expect(code, err.join('\n')).toBe(0);
  return out.join('\n');
}

/** `invite create`: the printed link (shown once), its token and the invitation id from the audit line. */
async function createInvitation(email: string, tags: string): Promise<Created> {
  const output = await invite('create', '--email', email, '--tags', tags, '--operator', 'it', '--batch', `it-${run}`);
  const link = /^https?:\/\/\S+\/invitation\/\S+$/m.exec(output)?.[0];
  const id = /\bid=([0-9a-f-]{36})\b/.exec(output)?.[1];

  expect(link?.startsWith(`${baseUrl}/invitation/`)).toBe(true);
  expect(id).toBeDefined();
  return { link: link as string, token: (link as string).slice(`${baseUrl}/invitation/`.length), id: id as string };
}

/** `/api/auth/me` with the browser's current session cookie. */
async function me(): Promise<Response> {
  const session = await browser.cookie('dm_session');

  expect(session).toBeTruthy();
  return fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: `dm_session=${session}` } });
}

/** Signs in through the GitHub stub as `login`, starting from the given sign-in href (with its returnTo). */
async function signInWithGithub(href: string, login: string): Promise<void> {
  await browser.open(`${baseUrl}${href}${href.includes('?') ? '&' : '?'}login=${login}`);
}

async function signOut(): Promise<void> {
  await browser.waitForIdle();
  await browser.clickButton('Sign out');
  await browser.waitForUrl('**/sign-in');
}

const accountState = (email: string) =>
  psql(
    `select array_to_string(u.roles, ','), u.session_version, (select count(*) from mentor_profiles p where p.user_id = u.id)
     from users u where u.email = '${email}'`,
  );

afterAll(async () => {
  await browser.close();
  await psql(`delete from invitations where batch = 'it-${run}'`);
  await psql(`delete from users where email like 'inv-%-${run}@devmentor.test'`);
});

describe('mentor invitation: CLI → link → GitHub sign-in → accept (agent-browser)', () => {
  let invitation: Created;

  it('shows the invited address and tags signed out, "Sign in with GitHub" first, both returning to the link', async () => {
    invitation = await createInvitation(INVITED, 'react,typescript');

    await browser.open(invitation.link);
    await browser.waitForText('You are invited to mentor on DevMentor');
    const panel = await browser.text('section');

    expect(panel).toContain(`Invitation for ${INVITED}`);
    expect(panel).toContain('TypeScript');
    expect(panel).toContain('React');
    expect(panel.indexOf('Sign in with GitHub')).toBeLessThan(panel.indexOf('Sign in with email'));
    expect(await browser.count('section a')).toBe(2);
    expect(await browser.text('section a:nth-of-type(1)')).toBe('Sign in with GitHub');

    const returnTo = new URLSearchParams({ returnTo: `/invitation/${invitation.token}` }).toString();
    expect(await browser.attr('section a:nth-of-type(1)', 'href')).toBe(`/api/auth/github?${returnTo}`);
    expect(await browser.attr('section a:nth-of-type(2)', 'href')).toBe(`/sign-in?${returnTo}`);
    expect(await browser.count('button')).toBe(0);
  });

  it('signs in with GitHub as the invited persona and comes back to the invitation with Accept', async () => {
    const href = await browser.attr('section a:nth-of-type(1)', 'href');

    await signInWithGithub(href as string, INVITED_LOGIN);
    await browser.waitForUrl(`**/invitation/${invitation.token}`);
    await browser.waitForText(`The mentor role goes to ${INVITED}.`);

    expect(await accountState(INVITED)).toBe('mentee|0|0');
  });

  it('accepts and lands on /mentor with the publish-by date, still signed in after a reload', async () => {
    await browser.waitForIdle();
    await browser.clickButton('Accept invitation');
    await browser.waitForUrl('**/mentor');
    await browser.waitForText(PUBLISH_BY);

    await browser.open(`${baseUrl}/mentor`);
    await browser.waitForText(PUBLISH_BY);
    expect(new URL(await browser.url()).pathname).toBe('/mentor');
    expect(await browser.text('main')).toMatch(new RegExp(`${PUBLISH_BY} \\S`));
    expect(await browser.text(MAIN_NAV)).toContain('Mentor workspace');
    expect(await browser.attr(`${MAIN_NAV} a[aria-current="page"]`, 'href')).toBe('/mentor');

    const response = await me();
    expect(response.status).toBe(200);
    expect((await response.json()).data.user).toMatchObject({ email: INVITED, roles: ['mentee', 'mentor'] });

    expect(await accountState(INVITED)).toBe('mentee,mentor|1|1');
    expect(await psql(`select accepted_at is not null and accepted_by_id is not null from invitations where id = '${invitation.id}'`)).toBe('t');
  });

  it('reopening the used link says "You are already a mentor." with a link to /mentor; nothing is granted again', async () => {
    await browser.open(invitation.link);
    await browser.waitForText('You are already a mentor.');

    expect(await browser.attr('section a', 'href')).toBe('/mentor');
    expect(await browser.count('button')).toBe(0); // no Accept (the page has no account bar)
    expect(await accountState(INVITED)).toBe('mentee,mentor|1|1');
    expect(await psql(`select count(*) from invitations where email = '${INVITED}' and accepted_at is not null`)).toBe('1');
  });
});

describe('mentor invitation: mismatched account, invalid links, no "become a mentor" path', () => {
  it('another account sees both addresses and no Accept; a direct POST is 403 and changes nothing', async () => {
    const other = await createInvitation(MISMATCH_INVITED, 'python');

    await browser.open(`${baseUrl}/mentor`);
    await signOut();
    await signInWithGithub(`/api/auth/github?${new URLSearchParams({ returnTo: `/invitation/${other.token}` })}`, OTHER_LOGIN);
    await browser.waitForUrl(`**/invitation/${other.token}`);
    await browser.waitForText(`You are signed in as ${OTHER}`);

    const panel = await browser.text('section');
    expect(panel).toContain(MISMATCH_INVITED);
    expect(panel).toContain(OTHER);
    expect(panel).not.toContain('Accept invitation');
    expect(await browser.count('section button')).toBe(1); // "Sign out"

    const before = await accountState(OTHER);
    const session = await browser.cookie('dm_session');
    const res = await fetch(`${baseUrl}/api/invitations/${other.token}/accept`, {
      method: 'POST',
      headers: { 'x-devmentor-request': '1', cookie: `dm_session=${session}` },
    });

    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(before).toBe('mentee|0|0');
    expect(await accountState(OTHER)).toBe(before);
    expect(await psql(`select accepted_at is null and accepted_by_id is null from invitations where id = '${other.id}'`)).toBe('t');
  });

  it('a signed-in mentee without an invitation finds no way to become a mentor', async () => {
    await browser.open(`${baseUrl}/mentors`);
    await browser.waitForText(OTHER);
    expect(await browser.text(MAIN_NAV)).not.toContain('Mentor workspace');
    expect(await browser.count('a[href^="/mentor"]:not([href^="/mentors"])')).toBe(0);
    expect((await browser.text('body')).toLowerCase()).not.toMatch(/become a mentor|apply to mentor|mentor workspace/);

    // A signed-in user on /sign-in goes home (no mentor offer on the way).
    await browser.open(`${baseUrl}/sign-in`);
    await browser.waitForUrl('**/mentors');
    expect((await browser.text('body')).toLowerCase()).not.toMatch(/become a mentor|apply to mentor/);

    await browser.open(`${baseUrl}/mentor`);
    await browser.waitForUrl('**/mentors?notice=mentor_only');
    await browser.waitForText('This page is for mentors.');
    expect(await browser.count('a[href^="/mentor"]:not([href^="/mentors"])')).toBe(0);

    const session = await browser.cookie('dm_session');
    const direct = await fetch(`${baseUrl}/mentor`, { headers: { cookie: `dm_session=${session}` }, redirect: 'manual' });
    expect(await redirectTarget(direct)).toBe('/mentors?notice=mentor_only');
    expect(await accountState(OTHER)).toBe('mentee|0|0');
  });

  it('unknown, revoked (CLI) and expired (psql) links say one sentence and show no form', async () => {
    const revoked = await createInvitation(`inv-revoked-${run}@devmentor.test`, 'react');
    const expired = await createInvitation(`inv-expired-${run}@devmentor.test`, 'react');
    expect(await invite('revoke', revoked.id)).toContain('Invitation revoked');
    await psql(`update invitations set expires_at = now() - interval '1 second' where id = '${expired.id}'`);

    await signOut();

    for (const link of [`${baseUrl}/invitation/unknown-token`, revoked.link, expired.link]) {
      await browser.open(link);
      await browser.waitForText('This invitation is not valid');

      expect(await browser.count('section p'), link).toBe(1);
      expect(await browser.count('form, input, button'), link).toBe(0);
      expect(await browser.count('section a'), link).toBe(0);
    }

    expect(
      await psql(`select count(*) from users where email in ('inv-revoked-${run}@devmentor.test', 'inv-expired-${run}@devmentor.test')`),
    ).toBe('0');
  });
});

describe('mentor invitation: email registration from the invitation (L02, L11)', () => {
  it('registers through the email option, sets a password, returns to the invitation and accepts', async () => {
    const invitation = await createInvitation(REGISTERED, 'ai-agents');

    await browser.open(invitation.link);
    await browser.waitForText(`Invitation for ${REGISTERED}`);
    await browser.waitForIdle();
    await browser.click('section a:nth-of-type(2)');
    await browser.waitForUrl('**/sign-in?returnTo=*');
    await browser.waitForText('Sign in to DevMentor');
    await browser.waitForIdle();
    await browser.click('a[href^="/register"]');
    await browser.waitForUrl('**/register?returnTo=*');
    await browser.waitForText('Create an account');
    await browser.waitForIdle();
    await browser.fill('input[name="email"]', REGISTERED);
    await browser.clickButton('Send link');
    await browser.waitForText(`We sent an email to ${REGISTERED}.`);

    const link = verificationLinkIn(await waitForMail(REGISTERED));
    expect(new URLSearchParams(new URL(link).hash.slice(1)).get('returnTo')).toBe(`/invitation/${invitation.token}`);

    await browser.open(link);
    await browser.waitForText('Set your password');
    await browser.waitForIdle();
    await browser.fill('input[name="password"]', PASSWORD);
    await browser.clickButton('Set password and sign in');
    await browser.waitForUrl(`**/invitation/${invitation.token}`);
    await browser.waitForText(`The mentor role goes to ${REGISTERED}.`);

    await browser.waitForIdle();
    await browser.clickButton('Accept invitation');
    await browser.waitForUrl('**/mentor');
    await browser.waitForText(PUBLISH_BY);

    expect((await (await me()).json()).data.user).toMatchObject({ email: REGISTERED, roles: ['mentee', 'mentor'] });
    expect((await accountState(REGISTERED)).split('|')).toEqual(['mentee,mentor', expect.any(String), '1']);
    expect(await psql(`select accepted_at is not null from invitations where id = '${invitation.id}'`)).toBe('t');
  });
});
