// Exploratory edge probe (lesson 14: test where agents slip — empty states, money, time, permissions)
// against the running test env. Each check states the expectation from the specs; a FAIL is a bug
// candidate to reproduce and file, not a verdict. Usage: node .ai/scripts/qa-edge-probe.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, api, readyMentor, createSlot, testDb, check, finish } = startWalk();
const mentor = browser('qa-edge-mentor');
const mentee = browser('qa-edge-mentee');
const status = async (promise) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error.status ?? 0;
  }
};
const inMinutes = (minutes) => {
  const at = new Date(Date.now() + minutes * 60_000);
  at.setUTCSeconds(0, 0);
  return at.toISOString();
};

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const menteeCookie = await signIn(mentee, 'mock-mentee', '/mentors');

  // Money: bounds 25 min 50.00–300.00, 50 min 100.00–600.00 (spec mentor-prices).
  const price = (p25, p50) => status(api('/api/mentors/me/prices', mentorCookie, 'PUT', { price25: p25, price50: p50 }));
  check('price 300.00 / 600.00 (upper bounds) accepted', (await price('300.00', '600.00')) === 200);
  check('price 300.01 for 25 min refused', (await price('300.01', '600.00')) !== 200);
  check('price 49.99 for 25 min refused', (await price('49.99', '100.00')) !== 200);
  check('price with three decimals refused', (await price('100.555', '200.00')) !== 200);
  const cheaperLonger = await price('300.00', '100.00');
  check('50 min cheaper than 25 min (probe: no rule in the spec?)', true, `status ${cheaperLonger}`);
  await price('100.00', '200.00');

  // Time: two-hour lead (R09): exactly 120 min bookable, 119 min not.
  const at119 = await api('/api/availability/slots', mentorCookie, 'POST', { startsAt: inMinutes(119) }).catch((e) => ({ error: e.message }));
  const at121 = await api('/api/availability/slots', mentorCookie, 'POST', { startsAt: inMinutes(122) }).catch((e) => ({ error: e.message }));
  const open = (await api(`/api/mentors/${slug}`, null)).slots;
  const lengthsOf = (slot) => open.find((s) => s.id === slot?.id)?.bookableLengths;
  check('slot 119 min ahead is not bookable', !at119.id || (lengthsOf(at119) ?? []).length === 0, JSON.stringify(lengthsOf(at119) ?? at119.error ?? null));
  check('slot 122 min ahead is bookable', (lengthsOf(at121) ?? []).length > 0, JSON.stringify(lengthsOf(at121) ?? at121.error ?? null));
  check('slot in the past is refused', (await status(api('/api/availability/slots', mentorCookie, 'POST', { startsAt: inMinutes(-60) }))) !== 200);
  check('slot not on a whole minute', true, `status ${await status(api('/api/availability/slots', mentorCookie, 'POST', { startsAt: new Date(Date.now() + 5 * 3_600_000 + 30_500).toISOString() }))}`);

  // 50-minute booking must not overlap the next slot 30 minutes later.
  const a = await createSlot(mentorCookie, 30);
  const b = await api('/api/availability/slots', mentorCookie, 'POST', { startsAt: new Date(new Date(a.startsAt).getTime() + 30 * 60_000).toISOString() });
  const after = (await api(`/api/mentors/${slug}`, null)).slots;
  // Overlap is checked against bookings, not open times (spec booking-stripe-checkout): both lengths stay offered.
  check('a slot followed by an unbooked one 30 min later still offers 25 and 50', JSON.stringify(after.find((s) => s.id === a.id)?.bookableLengths) === '["25","50"]', JSON.stringify(after.find((s) => s.id === a.id)?.bookableLengths));
  check('the later slot offers 25 and 50', (after.find((s) => s.id === b.id)?.bookableLengths ?? []).length === 2);

  // Empty states and whitespace: profile fields, report message, session message.
  const blankBio = await status(api('/api/mentors/me', mentorCookie, 'PUT', { bio: '     ' }));
  const me = await api('/api/mentors/me', mentorCookie);
  check('a published page cannot be saved with a blank bio', blankBio !== 200 || (me.bio ?? '').trim() !== '', `status ${blankBio}, bio=${JSON.stringify(me.bio)}`);
  await mentee.open(`/m/${slug}`);
  await mentee.idle();
  const page = await mentee.text('main');
  check('mentor page shows no undefined/null/NaN', !/\bundefined\b|\bnull\b|NaN/.test(page), page.match(/.{0,40}(undefined|null|NaN).{0,40}/)?.[0] ?? '');
  await mentee.shot('01-mentor-page');

  // Permissions: a mentee cannot reach mentor or operator APIs.
  check('mentee cannot create slots', (await status(api('/api/availability/slots', menteeCookie, 'POST', { startsAt: inMinutes(300) }))) === 403);
  check('mentee cannot release payouts', (await status(api('/api/admin/payouts/release', menteeCookie, 'POST'))) === 403);
  check('mentee cannot set prices', (await status(api('/api/mentors/me/prices', menteeCookie, 'PUT', { price25: '100.00', price50: '200.00' }))) !== 200);

  // Booking page for a booking that is not yours: 404, never someone else's data.
  const someone = await testDb("select id from bookings limit 1");
  if (someone) check("another user's booking is 404 for the mentor", (await status(api(`/api/bookings/${someone}`, mentorCookie))) === 404);
});
