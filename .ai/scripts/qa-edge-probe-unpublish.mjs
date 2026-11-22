// Exploratory probe (lesson 14, empty states): a mentee holds a paid booking and the mentor then unpublishes
// the page. The mentee's booking, session and list pages must still name the mentor and work; nothing may
// render "undefined"/"null". The page is published again at the end. Usage: node .ai/scripts/qa-edge-probe-unpublish.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, api, readyMentor, createSlot, check, finish } = startWalk();
const mentor = browser('qa-unpub-mentor');
const mentee = browser('qa-unpub-mentee');
const broken = (text) => text.match(/.{0,50}\b(undefined|null|NaN|Invalid Date)\b.{0,50}/)?.[0] ?? '';

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const slot = await createSlot(mentorCookie, 500);
  const menteeCookie = await signIn(mentee, 'mock-mentee', '/mentors');
  const started = await api('/api/bookings', menteeCookie, 'POST', { slotId: slot.id, length: '25' });
  await fetch(`${started.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  const id = started.bookingId;

  await api('/api/mentors/me/unpublish', mentorCookie, 'POST');
  try {
    for (const [name, path] of [
      ['booking page', `/bookings/${id}`],
      ['session page', `/sessions/${id}`],
      ['my sessions', '/sessions'],
    ]) {
      await mentee.open(path);
      await mentee.idle();
      const text = await mentee.text('main');
      await mentee.shot(`mentee-${name.replace(/\s/g, '-')}`);
      check(`${name}: renders after unpublish`, text.length > 40, text.slice(0, 120));
      check(`${name}: no undefined/null`, broken(text) === '', broken(text));
    }
    const view = await api(`/api/bookings/${id}`, menteeCookie);
    check('booking API still names the mentor', view.mentor.displayName.trim() !== '', JSON.stringify(view.mentor));
    const cancel = await api(`/api/bookings/${id}`, menteeCookie);
    check('the mentee can still cancel (terms present)', cancel.cancellation !== null, JSON.stringify(cancel.cancellation));
    await mentor.open('/mentor/slots');
    await mentor.idle();
    const slotsText = await mentor.text('main');
    check('mentor slots page: no undefined/null', broken(slotsText) === '', broken(slotsText));
    await mentor.shot('mentor-slots');
  } finally {
    await api('/api/mentors/me/publish', mentorCookie, 'POST');
    console.log(`(page /m/${slug} published again)`);
  }
});
