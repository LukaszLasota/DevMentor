# Personas — DevMentor

Basis: `.ai/specs/product-brief.md` (Target group, Key flows "Mentor onboarding (1.0)", Business rules, Non-goals); research `2026-08-22-interview-mentor.md`, `2026-09-03-interview-staff-engineer-declined-before.md`, `2026-09-02-miro-board-vpc-mentor.md` (founders' hypotheses, used only where marked), `2026-09-04-mentor-list.csv`. Held out for the parity check: `2026-09-03-interview-senior-python-meetups.md`. · Built 2026-10-26 · Stance default: adversary (brief mode `own`); this session ran `validate` on the user's instruction.
Panel composition: one segment (mentor: senior engineer who already answers questions unpaid, brief Target group). Two roles in it: engaged helper and the indifferent seat. The split 1:1 is assumed; the data (`mentor-list.csv`: 29 of 50 warm contacts, 16 with an own audience, 23 unknown) does not give engagement proportions.
Coverage: 52 persona lines — 43 sourced, 9 assumed

## P01 — senior engineer who answers the same questions every month, unpaid

Runs: 1 · Session: `walkthroughs/2026-10-26-mentor-onboarding-session-001/`
- Segment and share of the panel: mentor, engaged helper; 1 of 2 (assumed split) `[INTERVIEW]` 2026-08-22-interview-mentor.md
- Situation the problem shows up in: the same three questions every month in DMs and on a community Slack `[INTERVIEW]` 2026-08-22
- State of mind at entry — curious and unhurried, because the invitation arrives as a side project, not a blocker `[ASSUMPTION]` derived from "on the side"
- How much this topic matters to them: occasional, two evenings a month `[INTERVIEW]` 2026-08-22
- Goal, in their words: "the notes earn something every month without me being on a call, and I keep my name on them" `[INTERVIEW]` 2026-08-22
- Success, as they would recognise it: answers reused instead of retyped; name kept on them `[INTERVIEW]` 2026-08-22
- Constraints — time, budget, who decides, switching cost: two evenings a month; decides alone `[INTERVIEW]` 2026-08-22 (decides alone: `[ASSUMPTION]`)
- Tools they already use: a private notes file, pasting from it into DMs and Slack `[INTERVIEW]` 2026-08-22
- Words they use: "notes", "the product", "the call is the delivery"; never "profile with ratings" `[INTERVIEW]` 2026-08-22
- Objections they will raise: transactional platforms where nothing survives the call (Codementor) `[INTERVIEW]` 2026-08-22
- What they will not do: publish anything a mentee did not agree to; collect ratings ("my GitHub is my profile") `[INTERVIEW]` 2026-08-22
- Traits the material supports: tried and dropped two channels (Codementor, a newsletter nobody paid for) `[INTERVIEW]` 2026-08-22
- No basis for: price expectations, employer stance, preferred stack, hours available beyond two evenings — ask in the next mentor interview.

## P02 — staff engineer at a product company who declined a mentoring platform before (indifferent seat)

Runs: 1 · Session: `walkthroughs/2026-10-26-mentor-onboarding-session-001/`
- Segment and share of the panel: mentor, the indifferent seat; 1 of 2 (assumed split) `[INTERVIEW]` 2026-09-03-interview-staff-engineer-declined-before.md
- Situation: on the invitation list; answers "interesting" questions on Slack, filters by whether she hit the problem herself `[INTERVIEW]` 2026-09-03 staff
- State of mind at entry — sceptical and short on time: "ok, ale pewnie powiem nie" `[INTERVIEW]` 2026-09-03 staff
- How much this topic matters: barely — "nie potrzebuję pieniędzy. potrzebuję nie tracić czasu" `[INTERVIEW]` 2026-09-03 staff
- Goal, in their words: "chcę odpowiedzieć na pytanie i mieć spokój" `[INTERVIEW]` 2026-09-03 staff
- Success: question known up front, text only, 25 minutes, a high price as a filter, found through her own link `[INTERVIEW]` 2026-09-03 staff
- Constraints: replies between meetings, next morning; not at weekends `[INTERVIEW]` 2026-09-03 staff; employer stance and hours unknown
- Tools: Slack mainly `[INTERVIEW]` 2026-09-03 staff
- Words they use: "konkretna zepsuta rzecz", "relacja" (rejects), "poważni" `[INTERVIEW]` 2026-09-03 staff
- Objections: monthly mentoring relationship; being listed next to strangers; ratings ("byłam oceniana. nie robię tego drugi raz") `[INTERVIEW]` 2026-09-03 staff
- What they will not do: write documentation for free; stay active after a month without bookings ("to zapomnę, że to istnieje") `[INTERVIEW]` 2026-09-03 staff
- Traits the material supports: replies fast but briefly; declines by default `[INTERVIEW]` 2026-09-03 staff
- No basis for: the concrete price she calls "high", whether her employer allows it, hours per month — the interviewer did not ask.

## P03 — OSS maintainer with an own audience who answers recurring questions from a notes file

Runs: 2 · Session: `walkthroughs/2026-10-26-mentor-onboarding-session-001/`
- Segment and share of the panel: mentor, engaged helper; 1 of 2 (assumed split); OSS maintainers are 7 of 50 candidates, 16 of 50 have an own audience `[DATA]` 2026-09-04-mentor-list.csv
- Situation: recurring questions, answered unpaid from a private notes file `[INTERVIEW]` 2026-08-22 (second instance from the same note: one voice, resampled)
- State of mind at entry — curious and unhurried `[ASSUMPTION]`
- How much this topic matters: occasional `[INTERVIEW]` 2026-08-22
- Goal: answers that keep earning under their own name `[INTERVIEW]` 2026-08-22
- Success: reputation compounds, name on everything `[DOCUMENT]` 2026-09-02-miro-board-vpc-mentor.md (founders' hypothesis)
- Constraints: limited evenings `[INTERVIEW]` 2026-08-22; switching cost from an existing audience channel `[ASSUMPTION]`
- Tools: notes file; a public repository and its issue tracker `[DATA]` mentor-list.csv (source OSS maintainer) + `[INTERVIEW]` 2026-08-22
- Words they use: "notes", "my GitHub is my profile" `[INTERVIEW]` 2026-08-22
- Objections: platforms take a cut but bring no audience `[DOCUMENT]` vpc-mentor (founders' hypothesis); transactional, nothing survives `[INTERVIEW]` 2026-08-22
- What they will not do: ratings; publish without the mentee's agreement `[INTERVIEW]` 2026-08-22
- No basis for: whether the audience would book paid sessions (A03), price — ask the held-out and next mentor interviews.

## P04 — staff-level engineer on the invitation list, nobody on the team knows them yet (indifferent seat)

Runs: 2 · Session: `walkthroughs/2026-10-26-mentor-onboarding-session-001/`
- Segment and share of the panel: mentor, the indifferent seat; 21 of 50 candidates are cold contacts ("nobody yet") `[DATA]` mentor-list.csv
- Situation: answers interesting Slack questions; declined a monthly-mentoring platform `[INTERVIEW]` 2026-09-03 staff (second instance from the same note: one voice, resampled)
- State of mind at entry — sceptical, expects to say no `[INTERVIEW]` 2026-09-03 staff
- How much this topic matters: barely; time matters more than money `[INTERVIEW]` 2026-09-03 staff
- Goal: answer one concrete broken thing, then be left alone `[INTERVIEW]` 2026-09-03 staff
- Success: question up front, text, found only by people she sends the link to `[INTERVIEW]` 2026-09-03 staff
- Constraints: no warm contact at DevMentor, so no first booking from someone she knows `[DATA]` mentor-list.csv + `[INTERVIEW]` 2026-09-03 staff ("pierwszy booking od kogoś, kogo znam")
- Tools: Slack `[INTERVIEW]` 2026-09-03 staff
- Words they use: "relacja" (rejects), "poważni", "spokój" `[INTERVIEW]` 2026-09-03 staff
- Objections: listed next to strangers; ratings; a quiet month `[INTERVIEW]` 2026-09-03 staff
- What they will not do: free documentation; weekend messages `[INTERVIEW]` 2026-09-03 staff
- Traits: declines by default `[INTERVIEW]` 2026-09-03 staff
- No basis for: price, employer stance, which stack — ask in a real interview.

Homogeneity flag: each role rests on one interview note, so P01/P03 and P02/P04 are one voice resampled per role, not independent people. Recorded as a finding about the material.
