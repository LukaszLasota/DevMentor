// Manual-QA walk of a text session and its note (specs 2026-11-20-text-session and 2026-11-20-session-note)
// against the running test env (.ai/qa/test-env.json) — spec 2026-11-22-qa-session-walk. The mentee books a new
// time at least 96 hours ahead and pays on the Stripe stub; the booking's times are then moved in the env's own
// test database (the same updates the integration suite makes) to open the session and later to end it. In the
// browser: both parties exchange a message on /sessions/[id]; the mentor sends a note, the mentee declines it
// with a comment, the mentor sends version 2 and the mentee approves it.
// Usage: node .ai/scripts/qa-session-note.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, readyMentor, createSlot, bookAndPay, testDb, check, finish } = startWalk();
const mentor = browser('qa-session-mentor');
const mentee = browser('qa-session-mentee');
const tag = Date.now().toString(36);
const MENTEE_MSG = `Hi, here is my question about React state (${tag}).`;
const MENTOR_MSG = `Hello, let us look at the reducer first (${tag}).`;
const NOTE_1 = `Session note v1 (${tag}): we reviewed the reducer and agreed to split the form state.`;
const COMMENT = `Please add the link to the docs we discussed (${tag}).`;
const NOTE_2 = `Session note v2 (${tag}): reducer split plus the React docs link on useReducer.`;
const main = (page) => page.text('main');

await finish(async () => {
  const mentorCookie = await signIn(mentor, 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const slot = await createSlot(mentorCookie, 96);
  await signIn(mentee, 'mock-mentee', '/mentors');
  const id = await bookAndPay(mentee, slug, slot.id);
  console.log(`setup: booking ${id} on /m/${slug}`);

  // Open the session: it started a minute ago and runs for its booked length.
  await testDb(`update bookings set starts_at = now() - interval '1 minute', ends_at = now() - interval '1 minute' + make_interval(mins => length_minutes) where id = '${id}'`);
  await mentee.open(`/sessions/${id}`);
  await mentee.waitText('Conversation');
  await mentee.fill('#session-message', MENTEE_MSG);
  await mentee.clickButton('Send');
  await mentee.waitText(MENTEE_MSG);
  await mentor.open(`/sessions/${id}`);
  await mentor.waitText(MENTEE_MSG);
  check('mentor sees the mentee message', (await main(mentor)).includes(MENTEE_MSG));
  await mentor.fill('#session-message', MENTOR_MSG);
  await mentor.clickButton('Send');
  await mentee.waitText(MENTOR_MSG);
  await mentee.shot('01-conversation');
  check('mentee sees the mentor reply (polling)', (await main(mentee)).includes(MENTOR_MSG));

  // End the session: the note can be written only afterwards.
  await testDb(`update bookings set starts_at = now() - interval '60 minutes', ends_at = now() - interval '35 minutes' where id = '${id}'`);
  await mentor.open(`/sessions/${id}`);
  await mentor.waitText('Session note');
  await mentor.fill('section[aria-labelledby="note-heading"] textarea[name="body"]', NOTE_1);
  await mentor.clickButton('Send to the mentee');
  await mentor.waitText("Waiting for the mentee's decision.");
  await mentor.shot('02-note-sent');
  check('mentor sent version 1', true);

  await mentee.open(`/sessions/${id}`);
  await mentee.waitText(NOTE_1);
  await mentee.clickButton('Decline');
  await mentee.fill('#decline-comment', COMMENT);
  await mentee.clickButton('Decline with this comment');
  await mentee.waitText('You declined the last version');
  await mentee.shot('03-declined');
  check('mentee declined with a comment', true);

  await mentor.open(`/sessions/${id}`);
  await mentor.waitText(COMMENT);
  check('mentor sees the decline comment', (await main(mentor)).includes(COMMENT));
  await mentor.fill('section[aria-labelledby="note-heading"] textarea[name="body"]', NOTE_2);
  await mentor.clickButton('Send to the mentee');
  await mentor.waitText("Waiting for the mentee's decision.");

  await mentee.open(`/sessions/${id}`);
  await mentee.waitText(NOTE_2);
  await mentee.clickButton('Approve note');
  await mentee.waitText('Approved');
  await mentee.shot('04-approved-mentee');
  check('mentee approved version 2', (await main(mentee)).includes(NOTE_2));

  await mentor.open(`/sessions/${id}`);
  await mentor.waitText('Approved');
  await mentor.shot('05-approved-mentor');
  const mentorView = await main(mentor);
  check('mentor sees the approved version 2', mentorView.includes('Approved') && mentorView.includes(NOTE_2));
});
