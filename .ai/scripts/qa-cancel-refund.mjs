// Manual-QA walk of "cancel more than 24 hours ahead → full refund" (spec 2026-11-20-booking-cancellation, AC1/AC4)
// against the running test env (.ai/qa/test-env.json). Setup goes through the API as mock-mentor (one new time
// 72 hours ahead); the mentee part is driven in the browser with agent-browser: Book on /m/<slug>, Pay on the
// Stripe stub, Cancel booking + confirm, then the mentor's slot list. Screenshots go to .ai/qa/artifacts_<stamp>/.
// Usage (owner-run, outside the sandbox): node .ai/scripts/qa-cancel-refund.mjs
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const bin = `${root}node_modules/.bin/agent-browser`;
const { baseUrl, status } = JSON.parse(readFileSync(`${root}.ai/qa/test-env.json`, 'utf8'));
if (status !== 'running') throw new Error('test env is not running: sh .ai/scripts/test-env-up.sh');

const artifacts = `${root}.ai/qa/artifacts_${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(artifacts, { recursive: true });
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const results = [];

function browser(session) {
  const run = async (...args) => {
    let stdout;
    try {
      ({ stdout } = await exec(bin, [...args, '--json'], { env: { ...process.env, AGENT_BROWSER_SESSION: session }, timeout: 60_000 }));
    } catch (error) {
      stdout = error.stdout ?? '';
      if (!stdout) throw error;
    }
    const result = JSON.parse(stdout);
    if (!result.success) throw new Error(`agent-browser ${args.join(' ')}: ${result.error}`);
    return result.data;
  };
  return {
    run,
    open: (url) => run('open', url),
    waitUrl: (pattern) => run('wait', '--url', pattern),
    waitText: (text) => run('wait', '--text', text),
    idle: () => run('wait', '--load', 'networkidle'),
    clickButton: (name) => run('find', 'role', 'button', 'click', '--name', name),
    text: async (selector) => (await run('get', 'text', selector)).text.replace(/\s+/g, ' '),
    eval: (js) => run('eval', js),
    shot: (name) => run('screenshot', `${artifacts}/${name}.png`),
    cookie: async (name) => (await run('cookies', 'get')).cookies.find((c) => c.name === name)?.value,
    close: () => run('close'),
  };
}

async function signIn(page, login, returnTo) {
  await page.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ login, returnTo })}`);
  await page.waitUrl(`**${returnTo}`);
  return `dm_session=${await page.cookie('dm_session')}`;
}

async function api(path, cookie, method = 'GET', body) {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { ...CSRF, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json();
  if (res.status !== 200) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json.data;
}

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const mentor = browser(`qa-cancel-mentor-${process.pid}`);
const mentee = browser(`qa-cancel-mentee-${process.pid}`);

try {
  // Setup: one new open time 72 hours ahead (outside the 24-hour line).
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const { slug } = await api('/api/mentors/me', mentorCookie);
  const startsAt = new Date(Date.now() + 72 * 3_600_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const slot = await api('/api/availability/slots', mentorCookie, 'POST', { startsAt: startsAt.toISOString() });
  console.log(`setup: slot ${slot.id ?? ''} at ${startsAt.toISOString()} on /m/${slug}`);

  // Mentee: book the new time and pay on the stub.
  await signIn(mentee, 'mock-mentee', '/mentors');
  await mentee.open(`${baseUrl}/m/${slug}`);
  await mentee.idle();
  await mentee.shot('01-mentor-page');
  // The page lists every open time in the API's order: press Book on the row of the time created above,
  // not on whichever time comes first.
  const index = (await api(`/api/mentors/${slug}`, '')).slots.filter((s) => s.bookableLengths.length > 0).findIndex((s) => s.id === slot.id);
  if (index < 0) throw new Error('the new time is not offered on the public page');
  await mentee.eval(`[...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === 'Book')[${index}].click()`);
  await mentee.waitUrl('**/pay/**');
  await mentee.shot('02-stripe-stub');
  await mentee.clickButton('Pay');
  await mentee.waitUrl('**/bookings/**');
  await mentee.waitText('Booked');
  await mentee.idle();
  const bookingUrl = (await mentee.run('get', 'url')).url;
  let main = await mentee.text('main');
  await mentee.shot('03-booked');
  check('booking confirmed after Pay', main.includes('Booked'));
  check('free-cancellation terms shown', main.includes('Free cancellation until') && main.includes('back in full'));

  // Cancel + confirm in the dialog.
  await mentee.clickButton('Cancel booking');
  await mentee.waitText('Cancel this booking?');
  await mentee.shot('04-confirm-dialog');
  await mentee.eval(`[...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent.trim() === 'Cancel booking').click()`);
  await mentee.waitText('Cancelled');
  await mentee.open(bookingUrl);
  await mentee.waitText('Cancelled');
  main = await mentee.text('main');
  await mentee.shot('05-cancelled');
  check('page says refunded in full', main.includes('refunded in full'));

  // The time is offered again; the mentor sees the cancellation.
  const open = (await api(`/api/mentors/${slug}`, '')).slots.map((s) => s.id);
  check('time offered again on the public page', open.includes(slot.id));
  const mine = (await api('/api/availability/slots', mentorCookie)).items.find((s) => s.id === slot.id);
  check('mentor slot list shows the booking as cancelled', mine?.booking === 'cancelled', `booking=${mine?.booking}`);
  await mentor.open(`${baseUrl}/mentor/slots`);
  await mentor.idle();
  await mentor.shot('06-mentor-slots');
} catch (error) {
  check('walk completed', false, error.message);
} finally {
  await Promise.allSettled([mentor.close(), mentee.close()]);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed; screenshots: ${artifacts.replace(root, '')}`);
process.exit(failed ? 1 : 0);
