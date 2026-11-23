// Lesson 16: three access-control boundaries from docs/security/threat-model.md, checked over HTTP against the
// running test env (.ai/qa/test-env.json). Every boundary follows the three-check rule (AGENTS.md § Quality gates):
// positive control for BOTH accounts, a denied read, a denied write, then the owner's data re-read and compared
// field by field. Auth failures or missing fixtures are reported as INCONCLUSIVE, never as a passed denial.
//   T-01  mentee B vs mentee A's booking         GET /api/bookings/{id}, POST …/cancel, …/report
//   T-02  mentee B and the operator vs a session  GET /api/sessions/{id}, POST …/messages
//   T-06  operator who is the booking's mentor    POST /api/admin/reports/{id}/resolve on their own dispute
// Cookie values are never printed. Usage: node .ai/scripts/qa-access-control.mjs
import { startWalk } from './lib/qa.mjs';

const { baseUrl, browser, signIn, readyMentor, createSlot, bookAndPay, testDb, check, finish } = startWalk();
const tag = Date.now().toString(36);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

/** Raw request: status and parsed body, no throw — denials are the expected outcome here. */
async function call(path, cookie, method = 'GET', body) {
  const res = await fetch(`${baseUrl}${path}`, { method, redirect: 'manual', headers: { ...CSRF, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // pages answer HTML
  }
  return { status: res.status, json, text };
}

/** Stops the walk when a positive control fails: a later 404/403 would prove nothing. */
function positive(name, ok, detail) {
  check(`positive control: ${name}`, ok, detail);
  if (!ok) throw new Error(`INCONCLUSIVE — positive control failed: ${name}`);
}

const leaks = (res, ...secrets) => secrets.some((s) => s && res.text.includes(s));
const denied = (res) => res.status === 403 || res.status === 404;
// Ids interpolated into SQL come from this app's own responses (UUIDs) and the test DB only; assert the shape anyway.
const uuid = (s) => { if (!/^[0-9a-f-]{36}$/.test(s)) throw new Error(`not a uuid: ${s}`); return s; };

await finish(async () => {
  const mentorPage = browser('acl-mentor');
  const menteeA = browser('acl-mentee-a');
  const menteeB = browser('acl-mentee-b');
  const operatorPage = browser('acl-operator');

  const mentorCookie = await signIn(mentorPage, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const aCookie = await signIn(menteeA, `acl-a-${tag}`, '/mentors');
  const bCookie = await signIn(menteeB, `acl-b-${tag}`, '/mentors');
  const opCookie = await signIn(operatorPage, 'mock-operator', '/admin');

  const meA = await call('/api/auth/me', aCookie);
  const meB = await call('/api/auth/me', bCookie);
  const meOp = await call('/api/auth/me', opCookie);
  positive('mentee A is signed in', meA.status === 200 && meA.json?.data?.user?.email === `acl-a-${tag}@devmentor.test`);
  positive('mentee B is signed in as a different account', meB.status === 200 && meB.json?.data?.user?.email === `acl-b-${tag}@devmentor.test`);
  positive('operator is signed in with the operator role', meOp.status === 200 && meOp.json?.data?.user?.roles?.includes('operator'));
  positive('operator reaches its own page /admin', (await call('/admin', opCookie)).status === 200);

  // ---- T-01: mentee B vs mentee A's booking (horizontal, read + write) ----
  const slot1 = await createSlot(mentorCookie, 96);
  const booking1 = await bookAndPay(menteeA, slug, slot1.id);
  const before1 = await call(`/api/bookings/${booking1}`, aCookie);
  positive('T-01 mentee A reads own booking', before1.status === 200 && before1.json.data.status === 'confirmed', `status ${before1.json?.data?.status}`);
  const ownB = await bookAndPay(menteeB, slug, (await createSlot(mentorCookie, 96)).id);
  positive('T-01 mentee B reads own booking', (await call(`/api/bookings/${ownB}`, bCookie)).status === 200);

  const read1 = await call(`/api/bookings/${booking1}`, bCookie);
  check('T-01 mentee B cannot read A booking', denied(read1) && !leaks(read1, before1.json.data.startsAt), `HTTP ${read1.status}`);
  const cancel1 = await call(`/api/bookings/${booking1}/cancel`, bCookie, 'POST', { expectRefund: true });
  check('T-01 mentee B cannot cancel A booking', denied(cancel1), `HTTP ${cancel1.status}`);
  const report1 = await call(`/api/bookings/${booking1}/report`, bCookie, 'POST', { message: `This booking is not mine at all (${tag}).` });
  check('T-01 mentee B cannot report A booking', denied(report1), `HTTP ${report1.status}`);
  const after1 = await call(`/api/bookings/${booking1}`, aCookie);
  check('T-01 A booking unchanged after the attempts', after1.status === 200 && JSON.stringify(after1.json.data) === JSON.stringify(before1.json.data));
  check('T-01 no report row written', (await testDb(`select count(*) from booking_reports where booking_id = '${uuid(booking1)}'`)) === '0');

  // ---- T-02: mentee B and the operator vs A's text session (read + write) ----
  const slot2 = await createSlot(mentorCookie, 96);
  const booking2 = await bookAndPay(menteeA, slug, slot2.id);
  await testDb(`update bookings set starts_at = now() - interval '1 minute', ends_at = now() - interval '1 minute' + make_interval(mins => length_minutes) where id = '${uuid(booking2)}'`);
  const secret = `private question ${tag}`;
  const sent = await call(`/api/sessions/${booking2}/messages`, aCookie, 'POST', { body: secret });
  positive('T-02 mentee A writes in own session', sent.status === 200, `HTTP ${sent.status}`);
  const before2 = await call(`/api/sessions/${booking2}`, aCookie);
  positive('T-02 mentee A reads own session with the message', before2.status === 200 && before2.text.includes(secret));
  positive('T-02 the mentor (other party) reads the session', (await call(`/api/sessions/${booking2}`, mentorCookie)).status === 200);

  for (const [who, cookie] of [['mentee B', bCookie], ['operator', opCookie]]) {
    const read = await call(`/api/sessions/${booking2}`, cookie);
    check(`T-02 ${who} cannot read the session`, denied(read) && !leaks(read, secret), `HTTP ${read.status}`);
    const write = await call(`/api/sessions/${booking2}/messages`, cookie, 'POST', { body: `let me in ${tag}` });
    check(`T-02 ${who} cannot write to the session`, denied(write), `HTTP ${write.status}`);
  }
  const after2 = await call(`/api/sessions/${booking2}`, aCookie);
  check('T-02 session unchanged after the attempts (ids, authors, bodies)', after2.status === 200 && JSON.stringify(after2.json.data.messages) === JSON.stringify(before2.json.data.messages));
  check('T-02 no foreign message stored', (await testDb(`select count(*) from session_messages where body like 'let me in ${tag}%'`)) === '0');

  // ---- T-06: an operator who is also the booking's mentor resolves the dispute on their own session ----
  // The operator role comes from OPERATOR_EMAILS (reconciled on every request), so the mentor+operator account is
  // mock-operator made a mentor in the env's own test database: the stored `mentor` role plus an empty mentor page,
  // which the API then fills and publishes like any mentor. Idempotent; the env is disposable.
  const opEmail = 'mock-operator@devmentor.test';
  await testDb(`update users set roles = array_append(roles, 'mentor') where email = '${opEmail}' and not ('mentor' = any(roles))`);
  await testDb(`insert into mentor_profiles (id, user_id, stack_tags, created_at, updated_at) select gen_random_uuid(), id, '{}', now(), now() from users where email = '${opEmail}' on conflict do nothing`);
  const opMentorCookie = await signIn(browser('acl-op-mentor'), 'mock-operator', '/mentor');
  const meOpMentor = await call('/api/auth/me', opMentorCookie);
  positive('T-06 mock-operator holds operator + mentor', meOpMentor.json?.data?.user?.roles?.includes('operator') && meOpMentor.json.data.user.roles.includes('mentor'));
  let opPage = (await call('/api/mentors/me', opMentorCookie)).json?.data;
  if (opPage?.publishedAt == null) {
    await call('/api/mentors/me', opMentorCookie, 'PUT', { displayName: 'Ops Mentor', publicWorkUrl: 'https://github.com/mock-operator', bio: 'Ops Mentor is the operator who also mentors, for the access-control walk.', stackTags: ['typescript'] });
    await call('/api/mentors/me/publish', opMentorCookie, 'POST');
    if (!opPage?.prices) await call('/api/mentors/me/prices', opMentorCookie, 'PUT', { price25: '100', price50: '200' });
    opPage = (await call('/api/mentors/me', opMentorCookie)).json?.data;
  }
  positive('T-06 the operator has a published mentor page', opPage?.publishedAt != null && opPage.slug != null);

  const report = async (mentorSlug, mentorCk) => {
    const booking = await bookAndPay(menteeA, mentorSlug, (await createSlot(mentorCk, 96)).id);
    const res = await call(`/api/bookings/${booking}/report`, aCookie, 'POST', { message: `The mentor never showed up for this session (${tag}).` });
    positive('T-06 mentee A reports a booking', res.status === 200, `HTTP ${res.status}`);
    return testDb(`select id from booking_reports where booking_id = '${uuid(booking)}'`);
  };
  const ownReport = await report(opPage.slug, opMentorCookie);
  const otherReport = await report(slug, mentorCookie);

  const other = await call(`/api/admin/reports/${otherReport}/resolve`, opMentorCookie, 'POST', {});
  positive('T-06 the operator resolves a dispute on another mentor\'s booking', other.status === 200, `HTTP ${other.status}`);
  const self = await call(`/api/admin/reports/${ownReport}/resolve`, opMentorCookie, 'POST', {});
  check('T-06 the operator cannot resolve the dispute on their own booking', self.status === 403, `HTTP ${self.status} ${self.json?.error?.code ?? ''}`);
  check('T-06 own report still open after the attempt', (await testDb(`select resolved_at is null from booking_reports where id = '${uuid(ownReport)}'`)) === 't');
});
