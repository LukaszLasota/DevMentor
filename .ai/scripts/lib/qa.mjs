// Shared helpers of the .ai/scripts/qa-*.mjs walks: the running test env (.ai/qa/test-env.json), agent-browser
// sessions, stub sign-in, the CSRF-guarded API, mock-mentor setup and PASS/FAIL reporting with screenshots in
// .ai/qa/artifacts_<stamp>/. Test env only: every write goes to the disposable instance the descriptor names.
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const bin = `${root}node_modules/.bin/agent-browser`;
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

/** Reads the running env and prepares the artifacts folder; stops when the env is not running. */
export function startWalk() {
  const env = JSON.parse(readFileSync(`${root}.ai/qa/test-env.json`, 'utf8'));
  if (env.status !== 'running') throw new Error('test env is not running: sh .ai/scripts/test-env-up.sh');

  const artifacts = `${root}.ai/qa/artifacts_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  mkdirSync(artifacts, { recursive: true });
  const { baseUrl } = env;
  const results = [];
  const browsers = [];

  function browser(session) {
    const run = async (...args) => {
      let stdout;
      try {
        ({ stdout } = await exec(bin, [...args, '--json'], { env: { ...process.env, AGENT_BROWSER_SESSION: `${session}-${process.pid}` }, timeout: 60_000 }));
      } catch (error) {
        stdout = error.stdout ?? '';
        if (!stdout) throw error;
      }
      const result = JSON.parse(stdout);
      if (!result.success) throw new Error(`agent-browser ${args.join(' ')}: ${result.error}`);
      return result.data;
    };
    const page = {
      run,
      open: (url) => run('open', url.startsWith('/') ? `${baseUrl}${url}` : url),
      waitUrl: (pattern) => run('wait', '--url', pattern),
      waitText: (text) => run('wait', '--text', text),
      idle: () => run('wait', '--load', 'networkidle'),
      url: async () => (await run('get', 'url')).url,
      clickButton: (name) => run('find', 'role', 'button', 'click', '--name', name),
      fill: (selector, text) => run('fill', selector, text),
      text: async (selector) => (await run('get', 'text', selector)).text.replace(/\s+/g, ' '),
      eval: (js) => run('eval', js),
      shot: (name) => run('screenshot', `${artifacts}/${name}.png`),
      cookie: async (name) => (await run('cookies', 'get')).cookies.find((c) => c.name === name)?.value,
      close: () => run('close'),
    };
    browsers.push(page);
    return page;
  }

  async function signIn(page, login, returnTo) {
    await page.open(`/api/auth/github?${new URLSearchParams({ login, returnTo })}`);
    await page.waitUrl(`**${returnTo}`);
    return `dm_session=${await page.cookie('dm_session')}`;
  }

  async function api(path, cookie, method = 'GET', body) {
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { ...CSRF, cookie: cookie ?? '' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json();
    if (res.status !== 200) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`), { status: res.status });
    return json.data;
  }

  /** A fresh env has a mentor without a page: fill the profile, publish and price it, as the mentor would. */
  async function readyMentor(cookie) {
    let { slug, publishedAt, prices } = await api('/api/mentors/me', cookie);
    if (publishedAt === null) {
      await api('/api/mentors/me', cookie, 'PUT', {
        displayName: 'Mock Mentor',
        publicWorkUrl: 'https://github.com/mock-mentor',
        bio: 'Mock Mentor reviews TypeScript and React code for the QA walk.',
        stackTags: ['typescript'],
      });
      ({ slug } = await api('/api/mentors/me/publish', cookie, 'POST'));
    }
    if (!prices) await api('/api/mentors/me/prices', cookie, 'PUT', { price25: '100', price50: '200' });
    return slug;
  }

  /** Creates an open time on the first free whole hour at least `fromHours` ahead (earlier walks keep theirs). */
  async function createSlot(cookie, fromHours) {
    for (let extra = 0; extra < 48; extra += 1) {
      const startsAt = new Date(Date.now() + (fromHours + extra) * 3_600_000);
      startsAt.setUTCMinutes(0, 0, 0);
      try {
        return await api('/api/availability/slots', cookie, 'POST', { startsAt: startsAt.toISOString() });
      } catch (error) {
        if (error.status !== 409) throw error;
      }
    }
    throw new Error(`no free hour in the 48 hours after +${fromHours}h`);
  }

  /** Books `slotId` on /m/<slug> in the browser (its own row's Book button) and pays on the Stripe stub. */
  async function bookAndPay(page, slug, slotId) {
    await page.open(`/m/${slug}`);
    await page.idle();
    const index = (await api(`/api/mentors/${slug}`, null)).slots.filter((s) => s.bookableLengths.length > 0).findIndex((s) => s.id === slotId);
    if (index < 0) throw new Error('the new time is not offered on the public page');
    await page.eval(`[...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === 'Book')[${index}].click()`);
    await page.waitUrl('**/pay/**');
    await page.clickButton('Pay');
    await page.waitUrl('**/bookings/**');
    await page.waitText('Booked');
    await page.idle();
    return (await page.url()).split('/bookings/')[1].split(/[?#]/)[0];
  }

  /** SQL against the env's own PostgreSQL container — the disposable test database only. */
  async function testDb(sql) {
    const container = env.services?.postgres?.container;
    if (!container) throw new Error('test-env.json names no postgres container');
    const { stdout } = await exec('docker', ['exec', container, 'psql', '-U', 'devmentor', '-d', 'devmentor', '-tAc', sql]);
    return stdout.trim();
  }

  function check(name, ok, detail = '') {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  }

  /** Runs the walk, turns a thrown error into a FAIL, closes the browsers and exits with the failure count. */
  async function finish(walk) {
    try {
      await walk();
    } catch (error) {
      check('walk completed', false, error.message);
    } finally {
      await Promise.allSettled(browsers.map((page) => page.close()));
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed; screenshots: ${artifacts.replace(root, '')}`);
    process.exit(failed ? 1 : 0);
  }

  return { baseUrl, browser, signIn, api, readyMentor, createSlot, bookAndPay, testDb, check, finish };
}
