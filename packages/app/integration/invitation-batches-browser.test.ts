import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { openFreshBatch, resetInvitationBatches } from './fixtures/invitation-batches';
import { psql } from './psql';

// /admin/invitations in the browser (spec 2026-11-24-invitation-batches § UI/UX): TC-INV-002 (field
// errors, no request) and TC-INV-003 (a full batch offers the next one; a decided batch 1 with 4
// publishers shows the stop banner and no form). Batch state is built with SQL after a reset.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const DOMAIN = `-${run}@ib-browser.test`;
const browser = createAgentBrowser(`devmentor-ib-browser-${process.pid}`);
const STOPPED = 'Invitations are stopped: fewer than 5 of the first 20 published a slot within two weeks. Interview the decliners first.';
const BATCH1 = '(select id from invitation_batches where number = 1)';
/** Ticked stack-tag checkboxes of the invite form (Radix: `aria-checked="true"`). */
const TICKED_TAGS = '[data-field="stackTags"] button[role="checkbox"][aria-checked="true"]';

const pageText = async () => (await browser.text('main')).replace(/\s+/g, ' ');

async function cleanup(): Promise<void> {
  const people = `select id from users where email like '%${DOMAIN}'`;
  await psql(`delete from invitations where email like '%${DOMAIN}'`);
  await resetInvitationBatches();
  await psql(`delete from mentor_profiles where user_id in (${people})`);
  await psql(`delete from users where email like '%${DOMAIN}'`);
}

async function openPage(): Promise<void> {
  await browser.open(`${baseUrl}/admin/invitations`);
  await browser.waitForIdle();
  await browser.waitForText('Invitations');
}

/** `count` unaccepted invitations in batch 1, expired when `expired`. */
async function fillBatch1(prefix: string, count: number, expired: boolean): Promise<void> {
  await psql(
    'insert into invitations (id, email, token_hash, stack_tags, expires_at, invitation_batch_id, created_at, updated_at) ' +
      `select gen_random_uuid(), '${prefix}-' || g || '${DOMAIN}', md5(random()::text || g), '{python}', ` +
      `now() ${expired ? '-' : '+'} interval '1 day', ${BATCH1}, now() - interval '21 days', now() from generate_series(1, ${count}) g`,
  );
}

beforeAll(async () => {
  await cleanup();
  await browser.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: '/admin', login: 'mock-operator' })}`);
  await browser.waitForUrl('**/admin');
});

afterAll(async () => {
  await browser.close();
  await cleanup();
});

describe('/admin/invitations in the browser', () => {
  it('TC-INV-002: an invalid email and missing tags show field errors and create nothing', async () => {
    await resetInvitationBatches();
    await openFreshBatch();

    // The first run toggled one shared checkbox across both cases and clicked it right after typing
    // "anna": the mousedown blurred Email, CrudForm validated on blur and inserted the error above the
    // checkbox, the checkbox moved and the click was lost (the layout shift of lesson 2026-10-26).
    // Case 2 then ticked it, submitted a valid form and created an invitation, while the tag error
    // left over from case 1 satisfied the wait. Now each case starts from a fresh, empty form, ticks
    // before typing, blurs (clicking the heading) before pressing the button, and asserts the
    // checkbox state and the absence of the other error.
    const freshForm = async () => {
      await openPage();
      await browser.waitForText('Send invitation');
      expect(await browser.count(TICKED_TAGS)).toBe(0);
    };

    // An invalid email with a tag: only the email error.
    await freshForm();
    await browser.run('find', 'role', 'checkbox', 'click', '--name', 'TypeScript');
    expect(await browser.count(TICKED_TAGS)).toBe(1);
    await browser.fill('input[name="email"]', 'anna');
    await browser.click('h1');
    await browser.waitForText('Enter a valid email address, e.g. name@example.com.');
    await browser.clickButton('Send invitation');
    expect(await pageText()).not.toContain('Pick at least one stack tag.');
    expect(await browser.count(TICKED_TAGS)).toBe(1);

    // A valid email with no tag: only the tag error.
    await freshForm();
    await browser.fill('input[name="email"]', `valid${DOMAIN}`);
    await browser.click('h1');
    expect(await pageText()).not.toContain('Pick at least one stack tag.');
    await browser.clickButton('Send invitation');
    await browser.waitForText('Pick at least one stack tag.');
    expect(await pageText()).not.toContain('Enter a valid email address');
    expect(await pageText()).not.toContain('Invitation sent to');

    expect(await psql(`select count(*) from invitations where email like '%${DOMAIN}'`)).toBe('0');
  });

  it('TC-INV-003: a full batch 1 shows no form and offers "Open batch 2"', async () => {
    await resetInvitationBatches();
    await openFreshBatch();
    await fillBatch1('full', 20, false);
    await psql('update invitation_batches set closed_at = now() where number = 1');
    await openPage();
    await browser.waitForText('Open batch 2');

    const text = await pageText();
    expect(text).toContain('This batch is full. Open a new batch to invite more.');
    expect(text).toContain('20 of 20 sent, 0 accepted, 0 published within two weeks');
    expect(await browser.count('input[name="email"]')).toBe(0);
  });

  it('TC-INV-003: batch 1 decided with 4 publishers shows the stop banner, no form and no open button', async () => {
    await cleanup();
    await openFreshBatch();
    await psql('update invitation_batches set closed_at = now() where number = 1');

    for (let index = 0; index < 4; index += 1) {
      const userId = randomUUID();
      const profileId = randomUUID();
      await psql(
        [
          `insert into users (id, email, roles, created_at, updated_at) values ('${userId}', 'pub-${index}${DOMAIN}', '{mentee,mentor}', now(), now())`,
          `insert into mentor_profiles (id, user_id, display_name, created_at, updated_at) values ('${profileId}', '${userId}', 'Publisher ${index}', now(), now())`,
          'insert into invitations (id, email, token_hash, stack_tags, expires_at, accepted_at, accepted_by_id, publish_due_at, invitation_batch_id, created_at, updated_at) ' +
            `values (gen_random_uuid(), 'pub-${index}${DOMAIN}', md5(random()::text), '{python}', now() - interval '19 days', now() - interval '20 days', '${userId}', now() - interval '6 days', ${BATCH1}, now() - interval '21 days', now())`,
          `insert into slots (id, mentor_profile_id, starts_at, created_at, updated_at) values (gen_random_uuid(), '${profileId}', now() + interval '1 day', now() - interval '19 days', now())`,
        ].join('; '),
      );
    }
    await fillBatch1('expired', 16, true);

    await openPage();
    await browser.waitForText(STOPPED);

    const text = await pageText();
    expect(text).toContain('20 of 20 sent, 4 accepted, 4 published within two weeks');
    expect(text).toContain('Stopped');
    expect(text).toContain('Published a slot');
    expect(text).toContain('Expired, not accepted');
    expect(await browser.count('input[name="email"]')).toBe(0);
    expect(text).not.toMatch(/Open batch \d/);
  });
});
