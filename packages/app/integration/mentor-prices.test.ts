import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { psql } from './psql';

// Mentor prices end to end (spec 2026-10-21-mentor-prices, step 8), with the approved bounds the
// integration runner passes to the app (global-setup.ts): PLN, 25 min 50.00–300.00, 50 min
// 100.00–600.00. An invited mentor with a published page and a bookable slot is "Not bookable yet"
// until both prices are set; an out-of-bounds save names the ranges and changes nothing; prices set
// on /mentor/prices show on /m/<slug> signed out. Personas are unique per run; tests run in order.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const { runInviteCli } = await import('@devmentor/core/cli');
const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const browser = createAgentBrowser(`devmentor-prices-${process.pid}`);
const LOGIN = `pr-ada-${run}`;
const NAME = `Price Mentor ${run}`;
const SLUG = `price-mentor-${run}`;
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const NBSP = /\s/g;

async function onboardMentor(login: string): Promise<string> {
  const out: string[] = [];
  const err: string[] = [];
  const argv = ['create', '--email', `${login}@devmentor.test`, '--tags', 'python', '--operator', 'it', '--batch', `pr-${run}`];
  const code = await runInviteCli({ argv, stdout: (text) => out.push(text), stderr: (text) => err.push(text) });
  expect(code, err.join('\n')).toBe(0);
  const link = /^https?:\/\/\S+\/invitation\/\S+$/m.exec(out.join('\n'))?.[0] as string;
  const token = link.slice(`${baseUrl}/invitation/`.length);

  await browser.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: `/invitation/${token}`, login })}`);
  await browser.waitForUrl(`**/invitation/${token}`);
  await browser.waitForIdle();
  await browser.clickButton('Accept invitation');
  await browser.waitForUrl('**/mentor');

  return `dm_session=${await browser.cookie('dm_session')}`;
}

const api = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}${path}`, { ...init, headers: { ...CSRF, cookie } });
const putPrices = (cookie: string, price25: string, price50: string) =>
  api('/api/mentors/me/prices', cookie, { method: 'PUT', body: JSON.stringify({ price25, price50 }) });
const storedPrices = () =>
  psql(
    `select coalesce(price_25_cents::text, '-') || '/' || coalesce(price_50_cents::text, '-') from mentor_profiles p
     join users u on u.id = p.user_id where u.email = '${LOGIN}@devmentor.test'`,
  );

afterAll(async () => {
  await browser.close();
  await psql(`delete from invitations where batch = 'pr-${run}'`);
  await psql(`delete from users where email like 'pr-%-${run}@devmentor.test'`);
});

describe('mentor prices: bounds, /mentor/prices and the public page (agent-browser)', () => {
  let cookie: string;

  it('a published mentor with a bookable slot but no prices is "Not bookable yet"; /mentor asks for prices', async () => {
    cookie = await onboardMentor(LOGIN);
    await api('/api/mentors/me', cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: NAME, publicWorkUrl: 'https://github.com/ada/engine', bio: 'Engines.', stackTags: ['python'] }),
    });
    expect((await api('/api/mentors/me/publish', cookie, { method: 'POST' })).status).toBe(200);
    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    tomorrow.setUTCSeconds(0, 0);
    expect((await api('/api/availability/slots', cookie, { method: 'POST', body: JSON.stringify({ startsAt: tomorrow.toISOString() }) })).status).toBe(200);

    const html = await (await fetch(`${baseUrl}/m/${SLUG}`)).text();
    expect(html).toContain('Not bookable yet');
    expect(html).not.toContain('Session prices');
    await browser.open(`${baseUrl}/mentor`);
    await browser.waitForText('Set your prices');
    expect(await browser.attr('main a[href="/mentor/prices"]', 'href')).toBe('/mentor/prices');
  });

  it('refuses prices outside the bounds, naming each range, and saves nothing', async () => {
    const res = await putPrices(cookie, '49.99', '600.01');
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.fieldErrors.price25[0].replace(NBSP, ' ')).toBe('Allowed: PLN 50.00–PLN 300.00');
    expect(body.error.fieldErrors.price50[0].replace(NBSP, ' ')).toBe('Allowed: PLN 100.00–PLN 600.00');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await storedPrices()).toBe('-/-');

    const malformed = await putPrices(cookie, '1e3', '-5');
    expect(malformed.status).toBe(400);
    expect(await storedPrices()).toBe('-/-');
  });

  it('saves both prices on /mentor/prices; the public page shows them with the open times', async () => {
    await browser.open(`${baseUrl}/mentor/prices`);
    await browser.waitForText('Allowed:');
    await browser.waitForIdle();
    await browser.fill('input[name="price25"]', '150');
    await browser.fill('input[name="price50"]', '300.50');
    await browser.clickButton('Save prices');
    await browser.waitForText('Prices saved.');

    expect(await storedPrices()).toBe('15000/30050');
    const html = (await (await fetch(`${baseUrl}/m/${SLUG}`)).text()).replace(/&nbsp;| /g, ' ');
    expect(html).toContain('PLN 150.00');
    expect(html).toContain('PLN 300.50');
    expect(html).not.toContain('Not bookable yet');
    const page = (await (await fetch(`${baseUrl}/api/mentors/${SLUG}`)).json()).data;
    expect(page.prices).toEqual({ price25Cents: 15000, price50Cents: 30050, currency: 'PLN' });
    expect(page.offerReady).toBe(true);
    expect(JSON.stringify(page)).not.toMatch(/minCents|maxCents|priceBounds/);

    await browser.open(`${baseUrl}/mentor`);
    await browser.waitForText('Set your prices');
    expect(await browser.text('main')).toMatch(/Done:\s*Set your prices/);
  });

  it('answers 401 signed out and 403 without CSRF', async () => {
    const signedOut = await fetch(`${baseUrl}/api/mentors/me/prices`, {
      method: 'PUT',
      headers: CSRF,
      body: JSON.stringify({ price25: '150', price50: '300' }),
    });
    const noCsrf = await fetch(`${baseUrl}/api/mentors/me/prices`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ price25: '150', price50: '300' }),
    });

    expect([signedOut.status, noCsrf.status]).toEqual([401, 403]);
    expect(await storedPrices()).toBe('15000/30050');
  });
});
