import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { resetInvitationBatches } from './fixtures/invitation-batches';
import { seedBookableMentor } from './fixtures/mentors';
import { waitForMail } from './mail';
import { psql } from './psql';
import { redirectTarget } from './redirect';

// Invitation batches, access control (spec 2026-11-24-invitation-batches; AGENTS.md "three checks";
// TC-INV-001 and TC-INV-004 in .ai/qa/scenarios/invitations/): (1) the operator reads the overview,
// opens batch 1 and invites — the email reaches the app log with a working link; a mentee and a mentor
// are signed in and reach their own pages; (2) both get 403 on every route with a valid payload, and
// signed out gets 401; (3) the operator's overview is re-read and compared field by field.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batchLabel = `ia-${run}`;
const INVITED = `ia-invited-${run}@devmentor.test`;
const operator = createAgentBrowser(`devmentor-ia-operator-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-ia-mentee-${process.pid}`);
const mentor = createAgentBrowser(`devmentor-ia-mentor-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

let operatorCookie: string;
let menteeCookie: string;
let mentorCookie: string;

async function signIn(browser: ReturnType<typeof createAgentBrowser>, login: string, returnTo: string): Promise<string> {
  await browser.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo, login })}`);
  await browser.waitForUrl(`**${returnTo}`);

  return `dm_session=${await browser.cookie('dm_session')}`;
}

async function api(path: string, cookie: string | null, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...CSRF, ...(cookie ? { cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') };
}

const overview = (cookie: string | null) => api('/api/admin/invitation-batches', cookie);
const open = (cookie: string | null) => api('/api/admin/invitation-batches', cookie, { method: 'POST' });
const invite = (cookie: string | null, email: string) =>
  api('/api/admin/invitations', cookie, { method: 'POST', body: { email, stackTags: ['typescript'] } });

const cleanup = async () => {
  await psql(`delete from invitations where email like 'ia-%-${run}@devmentor.test' or batch = '${batchLabel}'`);
  await resetInvitationBatches();
  await psql(`delete from users where email like 'ia-%-${run}@devmentor.test'`);
};

beforeAll(async () => {
  // The mentor fixture invites through the CLI (it opens its own batch); reset afterwards so this file
  // starts with no batch at all.
  const seeded = await seedBookableMentor(mentor, {
    login: `ia-mentor-${run}`,
    displayName: `Access Mentor ${run}`,
    stackTags: ['python'],
    batch: batchLabel,
    publish: false,
    prices: false,
    slotInHours: null,
  });
  mentorCookie = seeded.cookie;
  await resetInvitationBatches();
  operatorCookie = await signIn(operator, 'mock-operator', '/admin');
  menteeCookie = await signIn(mentee, `ia-mentee-${run}`, '/mentors');
});

afterAll(async () => {
  await operator.close();
  await mentee.close();
  await mentor.close();
  await cleanup();
});

let before: unknown;

describe('invitation batches: three access checks', () => {
  it('(1) the operator opens batch 1 and invites; the email carries a working link; the page shows the row', async () => {
    const fresh = await overview(operatorCookie);
    expect(fresh.status).toBe(200);
    expect(fresh.cacheControl).toBe('no-store');
    expect(fresh.body.data).toMatchObject({ stopped: false, canOpen: true, nextBatchNumber: 1, batches: [] });

    const opened = await open(operatorCookie);
    expect(opened.status).toBe(201);
    expect(opened.body.data.number).toBe(1);

    const sent = await invite(operatorCookie, ` ${INVITED.toUpperCase()} `);
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ email: INVITED, batchNumber: 1, sent: 1 });
    expect(JSON.stringify(sent.body)).not.toMatch(/token|\/invitation\//i);

    const mail = await waitForMail(INVITED);
    expect(mail.subject).toBe('You are invited to mentor on DevMentor');
    const link = /\bhttps?:\/\/\S+\/invitation\/\S+/.exec(mail.text)?.[0] as string;
    expect(link.startsWith(`${baseUrl}/invitation/`)).toBe(true);
    expect(await (await fetch(link)).text()).toContain(INVITED);

    // TC-INV-001 on the page: counts line and the row in words.
    await operator.open(`${baseUrl}/admin/invitations`);
    await operator.waitForText('1 of 20 sent, 0 accepted, 0 published within two weeks');
    const page = (await operator.text('main')).replace(/\s+/g, ' ');
    expect(page).toContain('Batch 1');
    expect(page).toContain('Waiting for acceptance');
    expect(page).toContain(INVITED);
    expect(await operator.count('nav[aria-label="Main"] a[href="/admin/invitations"]')).toBe(1);

    // Positive control for the other accounts: each is signed in and reaches its own resource.
    expect((await api('/api/auth/me', menteeCookie)).status).toBe(200);
    expect((await api('/api/mentors/me', mentorCookie)).status).toBe(200);
  });

  it('(2) a mentee and a mentor get 403 on every route with a valid payload; signed out gets 401', async () => {
    // Captured before the denied attempts; check (3) compares the re-read against it field by field.
    before = (await overview(operatorCookie)).body.data;

    for (const cookie of [menteeCookie, mentorCookie]) {
      expect((await overview(cookie)).status).toBe(403);
      expect((await open(cookie)).status).toBe(403);
      expect((await invite(cookie, `ia-denied-${run}@devmentor.test`)).status).toBe(403);
    }

    expect((await overview(null)).status).toBe(401);
    expect((await open(null)).status).toBe(401);
    expect((await invite(null, `ia-denied-${run}@devmentor.test`)).status).toBe(401);
    expect(await psql(`select count(*) from invitations where email = 'ia-denied-${run}@devmentor.test'`)).toBe('0');
    expect(await psql('select count(*) from invitation_batches')).toBe('1');

    // TC-INV-004: the page sends them home and their sidebar has no "Invitations" link.
    const pageAs = async (cookie: string) => fetch(`${baseUrl}/admin/invitations`, { headers: { cookie } });
    expect(await redirectTarget(await pageAs(menteeCookie))).toBe('/mentors?notice=operator_only');
    expect(await redirectTarget(await pageAs(mentorCookie))).toBe('/mentor?notice=operator_only');
    await mentee.open(`${baseUrl}/mentors`);
    await mentee.waitForIdle();
    expect(await mentee.count('a[href="/admin/invitations"]')).toBe(0);
    await mentor.open(`${baseUrl}/mentor`);
    await mentor.waitForIdle();
    expect(await mentor.count('a[href="/admin/invitations"]')).toBe(0);
  });

  it('(3) the operator re-reads the overview: unchanged field by field after the denied attempts', async () => {
    const after = (await overview(operatorCookie)).body.data;

    expect(before).toBeDefined();
    expect(after).toEqual(before);
    expect(after.stopped).toBe(false);
    expect(after.canOpen).toBe(false);
    expect(after.nextBatchNumber).toBe(2);
    expect(after.batches).toHaveLength(1);
    expect(after.batches[0]).toMatchObject({ number: 1, state: 'open', closedAt: null, counts: { sent: 1, accepted: 0, published: 0 } });
    expect(after.batches[0].invitations).toEqual([
      { id: expect.any(String), email: INVITED, mentorName: null, stackTags: ['typescript'], status: 'waiting', publishDueAt: null },
    ]);
    expect(after.beforeBatches.some((row: { email: string }) => row.email.startsWith('ia-denied-'))).toBe(false);
  });
});
