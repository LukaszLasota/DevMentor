// Reproduction probe (lesson 14): a mentee holds bookings with a mentor who then unpublishes the page and
// clears the display name. Checks what the mentee's pages say about the mentor, and where "Back to <mentor>"
// on a not-completed booking leads. The profile is restored at the end.
// Usage: node .ai/scripts/qa-edge-probe-cleared-mentor.mjs
import { startWalk } from './lib/qa.mjs';

const { baseUrl, browser, signIn, api, readyMentor, createSlot, check, finish } = startWalk();
const mentor = browser('qa-cleared-mentor');
const mentee = browser('qa-cleared-mentee');

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const before = await api('/api/mentors/me', mentorCookie);
  const menteeCookie = await signIn(mentee, 'mock-mentee', '/mentors');

  // A paid booking, and a hold the mentee abandons (Cancel on Checkout → not completed).
  const paidSlot = await createSlot(mentorCookie, 600);
  const paid = await api('/api/bookings', menteeCookie, 'POST', { slotId: paidSlot.id, length: '25' });
  await fetch(`${paid.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  const heldSlot = await createSlot(mentorCookie, 620);
  const held = await api('/api/bookings', menteeCookie, 'POST', { slotId: heldSlot.id, length: '25' });
  await fetch(`${held.checkoutUrl}/cancel`, { method: 'POST', redirect: 'manual' });
  await api(`/api/bookings/${held.bookingId}/release`, menteeCookie, 'POST').catch(() => undefined);

  await api('/api/mentors/me/unpublish', mentorCookie, 'POST');
  const cleared = await api('/api/mentors/me', mentorCookie, 'PUT', { displayName: '' }).then(() => true, (e) => e.message);
  try {
    check('an unpublished mentor can clear the display name', cleared === true, String(cleared));

    const paidView = await api(`/api/bookings/${paid.bookingId}`, menteeCookie);
    check('paid booking still names the mentor', paidView.mentor.displayName.trim() !== '', JSON.stringify(paidView.mentor));
    await mentee.open(`/bookings/${paid.bookingId}`);
    await mentee.idle();
    const paidText = await mentee.text('main');
    await mentee.shot('01-paid-booking');
    check('paid booking page has no empty mentor name', !/with\s+on\b/.test(paidText), paidText.slice(0, 140));

    await mentee.open(`/sessions/${paid.bookingId}`);
    await mentee.idle();
    const sessionText = await mentee.text('main');
    await mentee.shot('02-session');
    check('session page has no empty mentor name', !/session with\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/.test(sessionText), sessionText.slice(0, 120));

    const heldView = await api(`/api/bookings/${held.bookingId}`, menteeCookie);
    await mentee.open(`/bookings/${held.bookingId}`);
    await mentee.idle();
    const heldText = await mentee.text('main');
    await mentee.shot('03-not-completed');
    const link = heldView.mentor.slug === null ? null : `/m/${heldView.mentor.slug}`;
    const linkStatus = link === null ? null : (await fetch(`${baseUrl}${link}`)).status;
    check('"Back to mentor" does not lead to a missing page', link === null || linkStatus === 200, `status=${heldView.status}, link=${link} → ${linkStatus}; page: ${heldText.slice(0, 160)}`);
  } finally {
    await api('/api/mentors/me', mentorCookie, 'PUT', { displayName: before.displayName });
    await api('/api/mentors/me/publish', mentorCookie, 'POST');
    console.log(`(profile restored, /m/${slug} published again)`);
  }
});
