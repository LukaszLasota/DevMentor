# Walkthrough: Mentor onboarding (1.0), `.ai/prototypes/discovery/mentor-onboarding/revision-001/index.html`, 2026-10-26

The most consequential repeated hypothesis: invited mentors would hold back their first bookable slot because they cannot see the mentee's question before they are committed (instant booking, D10) — every persona in both runs raised it, and the held-out real interview says the same ("musiałbym widzieć, kto pyta"). Next real check: show the prototype to 3–5 invited mentors from the list and ask them to publish a slot while booking is described as instant. Every finding below is synthetic and does not satisfy the Definition of Ready.

Stance: validate (requested in `lekcja-07/persony-polecenie.txt`; the brief's mode `own` would default to adversary)
Panel: 2 runs × 2 personas; run 1: P01, P02; run 2: P03, P04
Basis: brief (Target group, Key flows, Business rules, Non-goals, Scope, Glossary); `[INTERVIEW]` 2026-08-22-interview-mentor.md, 2026-09-03-interview-staff-engineer-declined-before.md; `[DATA]` 2026-09-04-mentor-list.csv; `[DOCUMENT]` 2026-09-02-miro-board-vpc-mentor.md (founders' hypotheses, two lines of P03)
Panel snapshot: `personas.md` in this session (copy of `.ai/specs/research/personas.md` at run time)
Session: `.ai/specs/research/walkthroughs/2026-10-26-mentor-onboarding-session-001/`; subject `.ai/prototypes/discovery/mentor-onboarding/revision-001/index.html`; flow "Mentor onboarding (1.0)"
Composition: assumed — one segment (mentor) with an engaged seat and an indifferent seat, 1:1; the data gives no engagement proportions. Each seat rests on one interview note, so P01/P03 and P02/P04 are one voice resampled (homogeneity flag; a finding about the material).
Saturation: not reached — most of the 39 topics in the last three interviews were new (for example 20% fee on own-link mentees, weekend protection, stack-tag mismatch, no pause for the page).
Parity: 9 of 12 themes of the held-out note `2026-09-03-interview-senior-python-meetups.md` also raised by the panel; real-only: setup time limit, payment on a no-show, own content reused without asking
Elapsed: personas and state capture ~15 min; interviews and walks ~2 min (four subagents in parallel); consolidation and parity ~15 min
Not askable of this panel: A01 and A04 (mentee side); A05 only indirectly (vault is Later; asked as "what survives the session")

## 🎯 Scope and limits

Medium: the neutral grey prototype (static HTML, `file://`), walked with agent-browser 0.39.1. The main agent captured 19 states per persona in that persona's own browser session (happy path, a page form submitted empty, prices above the bound, a slot under two hours, share preview, payouts, plus the other-email and invalid-invitation states) and handed them to each persona's fresh-context subagent in one batch. Limitation: the persona could not steer the browser step by step; each persona's proposed next actions are recorded in its transcript, and deviations the capture did not include are marked "would not reach" there. Email sign-in, invitation creation, booking and payment are outside the prototype and were not walked. Logged in as the simulated GitHub account of the invited address (and once as another address for the mismatch state).

## 🔍 Barriers that repeated (worst first, ties marked)

### 1. No question before commitment — the slot is published blind (tied with 2–4)

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1), P03, P04 (run 2).
Slots screen (states 12–14, e.g. `screenshots/P02-12-slots-empty.png`) says nothing about when the mentor sees the question; under pressure P4 (instant booking, question visible at session start) P01 and P03 would remove or lapse their slot, P02 and P04 turn to a hard no. Fast reactions were irritation (P02, P04) and wariness (P01, P03). Grounded in the staff-engineer line "pytanie dostajesz z góry" (P02, P04) and, for P01/P03, in no passage — they inferred it from preparing answers from notes.
Touches D10 (instant booking without mentor acceptance), A06 (mentors accept answering without seeing the question), A02.
Real check: 3–5 invited mentors from `mentor-list.csv`; task "publish one slot" after being told booking is instant; record who publishes and why not. Data: after launch, slot removals and cancellations with reasons (A06's smallest test).

### 2. Invitation tied to an email that is not the GitHub email is a dead end (tied with 1, 3, 4)

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1), P03, P04 (run 2).
State 18 (`screenshots/P04-18-invitation-signed-in-other-email.png`): the page shows both addresses and only "Sign out"; every persona read it as a dead end and P01, P03 would give up. This is the deliberate strict rule of spec #22 (operator revokes and re-invites). P04 named the cause: invite on the work email, GitHub on a personal one.
Touches R11, R13, spec #22 edge case "GitHub verified primary email differs (common)".
Real check: for the first batch, record how many invited engineers' GitHub primary emails differ from the invited address and how many re-invitations the operator had to make (R16 log).

### 3. Two quiet weeks would end participation (tied with 1, 2, 4)

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01, P02 (run 1), P03, P04 (run 2).
Pressure P1 flipped P01 and P03 (they let the slot lapse) and confirmed P02/P04's "to zapomnę, że to istnieje". No screen covers what happens after publishing with no booking.
Touches A02, D13 (the two-week check), A03.
Real check: track per invited mentor days from publish to first booking and whether the slot is renewed after a booking-free week; ask lapsed mentors why.

### 4. Availability does not fit the slot model (tied with 1–3)

[SYNTHETIC]

Weight: 4; spread: ±0; personas: P01 (recurring "two evenings"), P02 (fixed hour vs replying between meetings or next morning), P03 (recurring evenings, no 25 vs 50 choice per slot), P04 (no weekend protection).
Slots screen (state 12) offers single date + time only.
Touches R02, R09; spec #25.
Real check: ask 3–5 mentors to describe their real availability for the next two weeks and try to enter it in the slots screen.

### 5. Being on the public list with no link-only option (ranked below 1–4: weight gap 2 > spread)

[SYNTHETIC]

Weight: 2; spread: ±0; personas: P02 (run 1), P04 (run 2).
"Save and publish page" (state 06–08) publishes at once; P2 pressure (listed next to strangers) flipped P02 to ignore and kept P04 out. Grounded in "nie wsadzajcie mnie na listę obok ludzi, których nie znam".
Touches R08, D08, A02.
Real check: ask invited mentors whether they publish when told they will appear on the stack-tag list; count publishers vs. decliners citing the list.

## 📋 Missing cases that repeated

### Nothing survives the session under the mentor's name

[SYNTHETIC]

Weight 2, spread ±0; P01 (run 1), P03 (run 2). The invitation and page sell the session only; notes stay private (R15, R03), so "the notes earn" goal has no place. Touches A05 (vault, Later) and D07. Real check: in the next mentor interview, ask what they did with their last reusable answer and whether a session alone is enough reason to join.

### Bank details before anyone books — mentors would postpone Stripe

[SYNTHETIC]

Weight 3, spread ±1; P01, P02 (run 1), P03 (run 2); P04 indifferent. Matches prototype assumption A3 (Connect optional) and the proposal R07. Real check: record when invited mentors connect Stripe relative to their first booking.

### Unrequested "mentee" role shown after sign-in

[SYNTHETIC]

Weight 3, spread ±1; P02 (run 1), P03, P04 (run 2). The account strip shows "(mentee)" before accepting (state 04). Spec #21: every account holds mentee. Real check: ask mentors in the usability test what "mentee" next to their email means to them.

### Platform fee on mentees brought through the mentor's own link; take-home unclear

[SYNTHETIC]

Weight 2, spread ±0; P01 (take-home after 20% unclear, run 1), P03 (20% on own-link mentees, run 2). Prices screen (state 09) states the 20% fee but no take-home amount. Touches R12, D15, A03. Real check: ask mentors with an own audience (16 of 50 on the list) whether they would send it through their link given the fee.

## ⚠️ Contradictions with the brief

### The two-week ask reads as a quota on a favour

[SYNTHETIC]

Weight 3, spread ±1; P01, P02 (run 1), P04 (run 2). R13/D13 make "one bookable session within two weeks" the invitation's ask; the mentor home shows it as a deadline ("by Tue 17 Nov"). The personas' material frames helping as a favour on their terms. Real check: in the first batch, ask decliners whether the two-week ask influenced the decision.

## 🔍 Outliers

P04 (run 2), the cold-contact indifferent seat, ignores the invitation and stops at state 05 (mentor home as a to-do list with a deadline): nobody at DevMentor knows them, so there is no first booking from someone they know — the condition the staff-engineer note names. 21 of 50 candidates are cold contacts (`mentor-list.csv`); this persona is the case the D13 threshold depends on.

## 🔁 Seen once, not reported as a finding

- P02 (run 1): the 50-minute price can equal the 25-minute price ($200/$200 accepted), so 50 minutes is cheaper per minute; the $200 cap blocks "price as a filter".
- P02 (run 1): no way to pause or expire the page after a quiet month.
- P01 (run 1): sharing the link in a free community could look like selling to people helped for free.
- P01 (run 1): no place to list the questions they answer; stack tags are not their pitch.
- P03 (run 2): stack shown on the page (TypeScript) does not match the invitation (TypeScript, React).
- P03 (run 2): one public-work link where "my GitHub is my profile".

## 🧪 To confirm with real users

| # | Hypothesis | Persona ids / runs | Settles | Who to recruit | How |
|---|---|---|---|---|---|
| 1 | Mentors hold back a slot when they cannot see the question first | P01, P02 / 1; P03, P04 / 2 | A06, A02, D10 | 3–5 invited mentors from the list | usability task "publish one slot" with instant booking explained; record publish/decline and reason |
| 2 | Invite email ≠ GitHub email blocks acceptance | all / 1–2 | spec #22 strict rule, R11 | first batch of 20 | count mismatches and re-invitations in the R16 log |
| 3 | Two booking-free weeks end participation | all / 1–2 | A02, D13 | invited mentors after publishing | days to first booking; renewals; interview lapsed mentors |
| 4 | Single date+time slots do not fit mentor availability | all / 1–2 | spec #25, R02 | 3–5 mentors | enter real two-week availability in the slots screen |
| 5 | The public list keeps some mentors from publishing | P02 / 1; P04 / 2 | R08, D08, A02 | invited mentors, incl. cold contacts | ask before publishing; count decliners citing the list |
| 6 | Nothing surviving the session weakens the reason to join | P01 / 1; P03 / 2 | A05, D07 | engaged mentors with a notes file | interview: last reusable answer, what they did with it |
| 7 | Mentors postpone Stripe until a booking | P01, P02 / 1; P03 / 2 | R07 (proposal), R14 | first batch | Connect time relative to first booking |
| 8 | "Mentee" label confuses invited mentors | P02 / 1; P03, P04 / 2 | spec #21 roles | 3–5 mentors | think-aloud on the account strip |
| 9 | Fee on own-link mentees and unclear take-home discourage sharing | P01 / 1; P03 / 2 | R12, D15, A03 | mentors with an own audience | interview + record booking source |
| 10 | The two-week ask reads as a quota | P01, P02 / 1; P04 / 2 | R13, D13 | decliners of the first batch | ask what influenced the decision |

## 📝 Interviews

Transcripts: `transcripts/run-1-P01.md`, `transcripts/run-1-P02.md`, `transcripts/run-2-P03.md`, `transcripts/run-2-P04.md` (interview with fast reaction, feeling and considered answer per question, grounding line, yes/no, decision simulation with five pressures, walk of 19 states, topics). Decisions: P01 accept and publish one trial slot; P02 accept, publish nothing; P03 accept and publish one slot, do not share the link; P04 ignore. Where story and pressure diverged: P01/P03 publish despite wanting notes to earn (story) but P4 and P1 flip them; P02 says "I might" to text sessions (story) yet publishes nothing once the list and instant booking are real.
Acquiescence: 6 yes of 13 answered past-behaviour yes/no answers (46%), 3 no-basis; not above one half, no answers excluded.
Grounding: no persona mentioned notes, documents or research; no stated-preference question was asked.

## 🔍 Parity with real interviews

Shared themes (9): see the question/who asks before accepting; no bank details before the first booking; does not know what to charge; name and consent on anything published; no ratings; brings an audience only with income in return; joins when people they know are there, declines with strangers; the notes/doc are the real value; suspicion of a cold, sales-like approach. Sentiment aligned (wary, conditional). The real interviewee is more concrete: "dwadzieścia minut. max" for setup, "ile ludzie biorą?" then a bit lower than others.
Real-only (blind spots, material to gather): setup time limit; wanting payment on a no-show; anger at own content reused without asking (and wanting to hear first about any AI use).
Panel-only (questions for the next real interview): see calibration.md. Overlap recorded in `.ai/specs/research/calibration.md`.

## 📸 Evidence

`screenshots/P01-01…19`, `P02-…`, `P03-…`, `P04-…` (19 states per persona, each from its own browser session); state text and controls per persona in `transcripts/.states-P0n.md`.
