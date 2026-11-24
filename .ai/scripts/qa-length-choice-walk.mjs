// om-qa-buddy session for #79 (lesson 18): drives the session-length choice on /m/mock-mentor through the
// browser only (agent-browser), after .ai/scripts/qa-setup-length-choice.mjs prepared time A (25 + 50) and
// time B (25 only). Screenshots go to the walk's artifacts folder. Usage: node .ai/scripts/qa-length-choice-walk.mjs
import { startWalk } from './lib/qa.mjs';

const { browser, signIn, check, finish } = startWalk();
// agent-browser `eval --json` wraps the value; unwrap it.
const value = async (page, js) => { const data = await page.eval(js); return data && typeof data === 'object' && 'result' in data ? data.result : data; };
const groups = `[...document.querySelectorAll('main fieldset[aria-label^="Length for"]')]`;
const describe = `${groups}.map((g) => ({
  label: g.getAttribute('aria-label'),
  caption: [...g.children].some((c) => c.textContent.trim() === 'Length'),
  options: [...g.querySelectorAll('label')].map((l) => {
    const input = l.querySelector('input[type=radio]');
    const dot = l.querySelector('span[aria-hidden="true"].rounded-full');
    const ls = getComputedStyle(l), ds = dot && getComputedStyle(dot);
    return { text: l.textContent.trim(), checked: input.checked, dot: !!dot, dotBorder: ds && ds.borderTopWidth, border: ls.borderTopColor, bg: ls.backgroundColor, cursor: ls.cursor };
  }),
}))`;

await finish(async () => {
  const visitor = browser('qa79-visitor');
  await visitor.open('/m/mock-mentor');
  await visitor.idle();
  await visitor.shot('step-01-signed-out');
  const [a, b] = await value(visitor, describe);
  console.log(JSON.stringify({ a, b }));

  // TC-079-001
  check('TC-079-001 caption "Length" on time A', a?.caption === true);
  check('TC-079-001 two options, each with a dot', a?.options.length === 2 && a.options.every((o) => o.dot));
  check('TC-079-001 25 min chosen, filled dot, highlighted border', a?.options[0].checked && a.options[0].dotBorder !== a.options[1].dotBorder && a.options[0].border !== a.options[1].border);
  // TC-079-004
  check('TC-079-004 time B: one chosen 25-min option with the caption', b?.caption === true && b.options.length === 1 && b.options[0].checked && b.options[0].text.startsWith('25 min'));
  // TC-079-005 hover (computed style while hovered)
  await visitor.run('hover', 'main fieldset label:nth-of-type(2)');
  const hovered = await value(visitor, `(() => { const l = document.querySelector('main fieldset label:nth-of-type(2)'); const s = getComputedStyle(l); return { border: s.borderTopColor, bg: s.backgroundColor, cursor: s.cursor }; })()`);
  await visitor.shot('step-02-hover-50');
  check('TC-079-005 hover changes the unchosen option and shows a pointer', (hovered.border !== a.options[1].border || hovered.bg !== a.options[1].bg) && hovered.cursor === 'pointer', JSON.stringify(hovered));
  // TC-079-006 narrow screen
  await visitor.run('set', 'viewport', '375', '800');
  await visitor.idle();
  await visitor.shot('step-03-narrow');
  const overflow = await value(visitor, 'document.documentElement.scrollWidth - document.documentElement.clientWidth');
  check('TC-079-006 no horizontal scroll at 375 px', overflow <= 0, `overflow ${overflow}px`);
  await visitor.run('set', 'viewport', '1280', '900');

  // TC-079-002 and TC-079-003 as the mentee
  const mentee = browser('qa79-mentee');
  await signIn(mentee, 'mock-mentee', '/m/mock-mentor');
  await mentee.idle();
  // Keyboard: focus the chosen radio of time A, ArrowRight moves the choice.
  await value(mentee, `${groups}[0].querySelector('input:checked').focus()`);
  await mentee.run('press', 'ArrowRight');
  const afterKey = await value(mentee, `(() => { const g = ${groups}[0]; const l = g.querySelectorAll('label')[1]; return { checked: [...g.querySelectorAll('input')].map((i) => i.checked), focusRing: getComputedStyle(l).boxShadow !== 'none' || getComputedStyle(l).outlineStyle !== 'none' }; })()`);
  await mentee.shot('step-04-keyboard-50');
  check('TC-079-003 ArrowRight moves the choice to 50 min', JSON.stringify(afterKey.checked) === '[false,true]', JSON.stringify(afterKey));
  check('TC-079-003 the focused option shows a focus ring', afterKey.focusRing === true);
  // Back to 25 by click, then 50 by click (pointer path), then Book.
  await value(mentee, `${groups}[0].querySelectorAll('label')[0].click()`);
  await value(mentee, `${groups}[0].querySelectorAll('label')[1].click()`);
  const chosen = await value(mentee, `[...${groups}[0].querySelectorAll('input')].map((i) => i.checked)`);
  check('TC-079-002 clicking "50 min" moves the dot to 50', JSON.stringify(chosen) === '[false,true]');
  await value(mentee, `${groups}[0].closest('div').parentElement.querySelector('button').click()`);
  await mentee.waitUrl('**/pay/**');
  await mentee.idle();
  await mentee.shot('step-05-payment-50');
  const pay = await mentee.text('body');
  check('TC-079-002 payment opens for the 50-minute price PLN 200.00', /200[.,]00/.test(pay) && /50/.test(pay), pay.slice(0, 160));
});
