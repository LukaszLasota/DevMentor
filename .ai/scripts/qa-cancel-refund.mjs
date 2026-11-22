// Manual-QA walk of "cancel more than 24 hours ahead → full refund" (spec 2026-11-20-booking-cancellation, AC1/AC4)
// against the running test env (.ai/qa/test-env.json). Setup goes through the API as mock-mentor (page published
// and priced on a fresh env, one new time at least 72 hours ahead); the mentee part runs in the browser with
// agent-browser: Book on /m/<slug>, Pay on the Stripe stub, Cancel booking + confirm, then the mentor's slot list.
// Usage: node .ai/scripts/qa-cancel-refund.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, api, readyMentor, createSlot, bookAndPay, check, finish } = startWalk();
const mentor = browser('qa-cancel-mentor');
const mentee = browser('qa-cancel-mentee');

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const slot = await createSlot(mentorCookie, 72);
  console.log(`setup: slot ${slot.id} at ${slot.startsAt} on /m/${slug}`);

  await signIn(mentee, 'mock-mentee', '/mentors');
  const bookingId = await bookAndPay(mentee, slug, slot.id);
  let main = await mentee.text('main');
  await mentee.shot('01-booked');
  check('booking confirmed after Pay', main.includes('Booked'));
  check('free-cancellation terms shown', main.includes('Free cancellation until') && main.includes('back in full'));

  await mentee.clickButton('Cancel booking');
  await mentee.waitText('Cancel this booking?');
  await mentee.shot('02-confirm-dialog');
  await mentee.eval(`[...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent.trim() === 'Cancel booking').click()`);
  await mentee.waitText('Cancelled');
  await mentee.open(`/bookings/${bookingId}`);
  await mentee.waitText('Cancelled');
  main = await mentee.text('main');
  await mentee.shot('03-cancelled');
  check('page says refunded in full', main.includes('refunded in full'));

  const open = (await api(`/api/mentors/${slug}`, null)).slots.map((s) => s.id);
  check('time offered again on the public page', open.includes(slot.id));
  const mine = (await api('/api/availability/slots', mentorCookie)).items.find((s) => s.id === slot.id);
  check('mentor slot list shows the booking as cancelled', mine?.booking === 'cancelled', `booking=${mine?.booking}`);
  await mentor.open('/mentor/slots');
  await mentor.idle();
  await mentor.shot('04-mentor-slots');
});
