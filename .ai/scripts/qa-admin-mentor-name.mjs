// QA evidence for #87 on the running test env: a mentee reports a paid booking, the mentor unpublishes and
// clears the display name; the operator's /admin "Reported bookings" row must name the mentor by e-mail,
// never leave the Mentor cell blank. The profile is restored at the end.
// Usage: node .ai/scripts/qa-admin-mentor-name.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, api, readyMentor, createSlot, check, finish } = startWalk();
const mentor = browser('qa-admin-name-mentor');
const mentee = browser('qa-admin-name-mentee');
const operator = browser('qa-admin-name-operator');

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  await readyMentor(mentorCookie);
  const before = await api('/api/mentors/me', mentorCookie);
  const menteeCookie = await signIn(mentee, 'mock-mentee', '/mentors');
  const slot = await createSlot(mentorCookie, 700);
  const paid = await api('/api/bookings', menteeCookie, 'POST', { slotId: slot.id, length: '25' });
  await fetch(`${paid.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  const message = `QA ${Date.now().toString(36)}: checking the mentor name on /admin.`;
  await api(`/api/bookings/${paid.bookingId}/report`, menteeCookie, 'POST', { message });

  await api('/api/mentors/me/unpublish', mentorCookie, 'POST');
  await api('/api/mentors/me', mentorCookie, 'PUT', { displayName: '' });
  try {
    await signIn(operator, 'mock-operator', '/admin');
    await operator.waitText('Reported bookings');
    const text = (await operator.text('main')).replace(/\s+/g, ' ');
    await operator.shot('01-admin-reported');
    // The row: Reported · Session · Mentee · Mentor · Booking · Message.
    const row = text.match(new RegExp(`mock-mentee@devmentor\\.test\\s*(.*?)\\s*${paid.bookingId}`))?.[1] ?? '';
    check('the Mentor cell names the mentor by e-mail', row.includes('mock-mentor@devmentor.test'), `mentor cell: ${JSON.stringify(row)}`);
    check('the report message is listed', text.includes(message));
  } finally {
    await api('/api/mentors/me', mentorCookie, 'PUT', { displayName: before.displayName });
    await api('/api/mentors/me/publish', mentorCookie, 'POST');
    console.log('(profile restored and published again)');
  }
});
