// QA data for the session-length choice on /m/<slug> (#79, lesson 18 om-qa-buddy session), on the running
// test env: mock-mentor published with prices, one open time with both lengths (A), and one time where only
// 25 minutes fit (B), because a mentee booked the time 30 minutes after it (C). Prints the slug and times.
// Usage: node .ai/scripts/qa-setup-length-choice.mjs
import { startWalk } from './lib/qa.mjs';

const { baseUrl, browser, signIn, api, readyMentor, createSlot, bookAndPay, check, finish } = startWalk();

await finish(async () => {
  const mentorCookie = await signIn(browser('qa-len-mentor'), 'mock-mentor', '/mentor');
  const slug = await readyMentor(mentorCookie);
  const a = await createSlot(mentorCookie, 72);
  const b = await createSlot(mentorCookie, 120);
  const cStart = new Date(new Date(b.startsAt).getTime() + 30 * 60_000).toISOString();
  const c = await api('/api/availability/slots', mentorCookie, 'POST', { startsAt: cStart });
  await signIn(browser('qa-len-booker'), `qa-len-booker-${Date.now().toString(36)}`, '/mentors');
  await bookAndPay(browser('qa-len-booker'), slug, c.id);
  const page = await api(`/api/mentors/${slug}`, null);
  const lengths = (id) => page.slots.find((s) => s.id === id)?.bookableLengths.join('+');
  check('A offers 25 + 50', lengths(a.id) === '25+50', lengths(a.id));
  check('B offers only 25', lengths(b.id) === '25', lengths(b.id));
  console.log(`MENTOR_PAGE=${baseUrl}/m/${slug}`);
  console.log(`A=${a.startsAt} B=${b.startsAt} C(booked)=${cStart}`);
});
