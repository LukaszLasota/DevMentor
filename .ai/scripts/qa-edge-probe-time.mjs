// Exploratory time-boundary probe (lesson 14) against the running test env, moving booking times in the
// env's own test database: the 24-hour free-cancellation line, cancelling a started session, the 50-minute
// overlap with the next open time, and reporting an unpaid hold. FAIL = bug candidate, not a verdict.
// Usage: node .ai/scripts/qa-edge-probe-time.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, api, readyMentor, createSlot, testDb, check, finish } = startWalk();
const mentor = browser('qa-time-mentor');
const mentee = browser('qa-time-mentee');
const attempt = async (promise) => {
  try {
    return { status: 200, data: await promise };
  } catch (error) {
    return { status: error.status ?? 0, error: error.message };
  }
};

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const menteeCookie = await signIn(mentee, 'mock-mentee', '/mentors');

  const bookPaid = async (slotId, length = '25') => {
    const started = await api('/api/bookings', menteeCookie, 'POST', { slotId, length });
    await fetch(`${started.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
    return started.bookingId;
  };
  const moveTo = (id, sql) => testDb(`update bookings set starts_at = ${sql}, ends_at = ${sql} + make_interval(mins => length_minutes) where id = '${id}'`);

  // 24-hour line: 24h + 1 min ahead → refund due; 23h 59 min → forfeited.
  const s1 = await createSlot(mentorCookie, 200);
  const b1 = await bookPaid(s1.id);
  await moveTo(b1, "now() + interval '24 hours 1 minute'");
  const v1 = await api(`/api/bookings/${b1}`, menteeCookie);
  check('24h + 1 min ahead: refund due', v1.cancellation?.refundDue === true, JSON.stringify(v1.cancellation));
  await moveTo(b1, "now() + interval '23 hours 59 minutes'");
  const v2 = await api(`/api/bookings/${b1}`, menteeCookie);
  check('23h 59 min ahead: fee forfeited', v2.cancellation?.refundDue === false, JSON.stringify(v2.cancellation));
  const stale = await attempt(api(`/api/bookings/${b1}/cancel`, menteeCookie, 'POST', { expectRefund: true }));
  check('cancel with a stale "refund" expectation inside 24h is refused', stale.status === 409, `${stale.status} ${stale.error ?? JSON.stringify(stale.data)}`);
  await mentee.open(`/bookings/${b1}`);
  await mentee.idle();
  const page = await mentee.text('main');
  check('booking page inside 24h warns about the fee', page.includes('forfeits'), page.slice(0, 160));
  await mentee.shot('01-inside-24h');

  // A session that has started cannot be cancelled.
  await moveTo(b1, "now() - interval '5 minutes'");
  const started = await attempt(api(`/api/bookings/${b1}/cancel`, menteeCookie, 'POST', { expectRefund: false }));
  check('a started session cannot be cancelled', started.status !== 200, `${started.status} ${started.error ?? ''}`);
  await mentee.open(`/bookings/${b1}`);
  await mentee.idle();
  const startedPage = await mentee.text('main');
  check('started booking page offers no Cancel booking', !startedPage.includes('Cancel booking'), startedPage.slice(0, 200));
  await mentee.shot('02-started');

  // 50-minute booking on a time followed by another 30 minutes later: the later time is no longer offered.
  const a = await createSlot(mentorCookie, 300);
  const b = await api('/api/availability/slots', mentorCookie, 'POST', { startsAt: new Date(new Date(a.startsAt).getTime() + 30 * 60_000).toISOString() });
  const b50 = await bookPaid(a.id, '50');
  const after = (await api(`/api/mentors/${slug}`, null)).slots.map((s) => s.id);
  check('the time inside a 50-minute booking is not offered', !after.includes(b.id));
  const clash = await attempt(api('/api/bookings', menteeCookie, 'POST', { slotId: b.id, length: '25' }));
  check('booking the overlapped time is refused', clash.status === 409, `${clash.status} ${clash.error ?? ''}`);
  const cancel50 = await attempt(api(`/api/bookings/${b50}/cancel`, menteeCookie, 'POST', { expectRefund: true }));
  const reopened = (await api(`/api/mentors/${slug}`, null)).slots.map((s) => s.id);
  check('after cancelling the 50-minute booking both times are offered again', cancel50.status === 200 && reopened.includes(a.id) && reopened.includes(b.id), `cancel ${cancel50.status}`);

  // Reporting an unpaid hold is not possible.
  const s3 = await createSlot(mentorCookie, 400);
  const hold = await api('/api/bookings', menteeCookie, 'POST', { slotId: s3.id, length: '25' });
  const report = await attempt(api(`/api/bookings/${hold.bookingId}/report`, menteeCookie, 'POST', { message: 'The mentor never answered my messages.' }));
  check('an unpaid hold cannot be reported', report.status !== 200, `${report.status} ${report.error ?? ''}`);
});
