# DevMentor — product brief

- Date: 2026-10-21 · Refreshed 2026-10-21 with `--refresh`: the open questions were answered by adopting the decisions of the course's reference brief (D07–D24); the session's D03–D06 are superseded and kept below.
- Mode: own; Owner: Łukasz Lasota (ran both sessions); Pass: full
- Evidence basis: seven interviews with seven different people (four developers, three senior engineers who help others) between 2026-08-20 and 2026-09-03, all recruited through the founders' networks or their mentor list; the 2026-08-20 and 2026-08-22 interviews exist only as summaries without raw notes or a named interviewer; one Discord help-channel export (109 threads, 14 days) and one anonymous survey (54 answers) from the same community, where founder B is a moderator; five benchmark checks dated 2026-09-04; the founders' board and workshop. The board's vision, goals and canvases are the founders' positions, not evidence. D07–D24 come from the course reference brief, which was built from an earlier, smaller pack and records most of them as the agent's recommendation on founder A's instruction; adopting them adds no evidence. The most consequential untested belief: developers will pay a stranger for a text session (A01), accepted untested with a check four weeks after ship (D18). Only 3 of 54 survey respondents have ever paid anyone.
- Coverage: 90 claims — 84 sourced (interview 13, data 6, document 60, product 0, benchmark 5), 0 synthetic, 6 assumed; 2 entries on the collection plan
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: Łukasz Lasota (session owner), adopting the reference brief's decisions, most of which it records as the agent's recommendation on founder A's instruction; founder A has not confirmed them against this brief's evidence. Ready for: implementation planning of the 1.0 scope. Q01 (where the text exchange happens) blocks the session story, Q10 (recording mentor-page visits) decides whether a visit-recording story belongs in the backlog, and Q04 applies only if the first iteration leaves out Connect onboarding.
- Sources: `research/` (interviews, `2026-09-04-discord-help-requests.csv`, `2026-09-04-survey-discord-willingness-to-pay.md`, `2026-09-04-benchmark-*.md`, `2026-08-26-workshop-export.md`, `2026-09-0*-miro-board-*.md`, `2026-09-04-mentor-list*.{md,csv}`, `2026-09-03-course-reference-product-brief.md`, `decisions/`)

## Decision summary

Decided: 1.0 is a marketplace for 25- or 50-minute text sessions with invited senior engineers, found through a stack-tag list or the mentor's share link, booked at least two hours ahead, paid through Stripe, with a note the mentor drafts and the mentee approves, kept privately. The vault, subscriptions, MCP and async Q&A are Later (D07). The adopted target is to ship on 2026-10-31, ten days from today with no mentor contacted yet, and to count 1.0 as working at 10 paid sessions a week for two consecutive weeks by 2026-12-31; a slip of the ship date moves the check dates by the same amount (D17).

The best-supported problem is a developer stuck on a specific blocker with nobody to ask: about half a day with a distrusted workaround, a slipped release, and a week of unpaid time on an estimate (where that person wanted a call, not text). In one community 21% of help threads got no human reply in 14 days (see Problems). On the other side, two of three senior engineers already answer recurring questions unpaid from a private notes file. Their conditions differ: one joins only with people he knows and real income; another wants the question first, no ratings, her own link, to know who else is there, and a first booking from someone she knows, and she lapses after a quiet month (R04, N02).

The open risk is fit with the urgent case. Developers asked for an answer "within the hour" or "in twenty minutes"; 1.0 books at least two hours ahead and promises no speed (D09), and the survey's stated willingness to pay was conditional on an answer within an hour. Whether developers pay (A01) and whether invited mentors publish slots (A02) are accepted untested with checks after ship (D18, D13). Three mentor conditions from the interviews are not served: seeing the question before accepting and knowing who asks (instant booking, D10 superseded D06), and not being listed next to strangers (every mentor is on the list, D08 superseded D04). The fourth-week check also cannot separate missing demand from missing supply, since few published slots also mean few paid sessions.

Next: run `om-backlog` on this brief. Founder A and founder B still owe Q01 before the session story and Q10 before the fourth-week check; Q04 matters only if the first iteration omits Connect onboarding. Four weeks after ship the founders read paid sessions against the warning line of 3 and the median booking-to-start against 48 hours (D17, D09).

## Vision

For senior engineers who already help others for free, and developers stuck without a senior: turn private help into paid sessions and, later, durable mentor-owned knowledge. This is the founders' intended direction, not a demonstrated benefit. `[DOCUMENT]` research/2026-09-02-miro-board-vision-target-needs.md

## Target group and stakeholders

- Customer (pays): the developer, usually personally. In the survey, 24 of 54 would pay out of their own pocket, 19 through an employer (13 if asked, 6 without asking), 2 through a client and 9 not at all; these are stated intentions. `[DATA]` research/2026-09-04-survey-discord-willingness-to-pay.md
- Customer (pays), interviews: the freelancer would pay himself ("klient mi nie placi za odrabianie lekcji"); the fintech developer was unsure ("sam bym zapłacił. chyba"); the platform developer would only expense it ("nie płacę za rzeczy do pracy sam"). `[INTERVIEW]` research/2026-09-02-interview-freelancer-react.md, research/2026-09-01-interview-backend-dev-fintech.md, research/2026-09-02-interview-platform-dev-solves-alone.md
- User (mentee): an employed or freelance developer with a specific blocker, a deadline and no senior available (TypeScript, Helm, a React estimate). `[INTERVIEW]` research/2026-08-20-interview-working-dev.md, research/2026-09-01-interview-backend-dev-fintech.md, research/2026-09-02-interview-freelancer-react.md
- User (mentee), beachhead: English-speaking TypeScript, React, Python and AI-agent developers; the founders' choice. `[DOCUMENT]` research/2026-09-02-miro-board-vision-target-needs.md
- User (mentor): a senior engineer who already answers recurring questions in DMs or Slack, unpaid, often from a private notes file. `[INTERVIEW]` research/2026-08-22-interview-mentor.md, research/2026-09-03-interview-senior-python-meetups.md, research/2026-09-03-interview-staff-engineer-declined-before.md
- Candidate mentors: a list of 50 in the beachhead stacks; public work found for 33, an own audience for 16 (23 unknown), a warm contact for 29; nobody contacted yet. `[DATA]` research/2026-09-04-mentor-list.csv
- Stakeholders: founder A (sponsor, product owner, UX) and founder B (project manager, tech lead, developer); QA and legal have nobody in the role; Stripe is the payment provider. `[DOCUMENT]` research/2026-09-05-miro-board-raci-matrix.md, research/2026-08-26-workshop-export.md
- Decider for scope decisions: founder A (Oliwia), per the workshop, the RACI and the course reference brief; the session owner adopted D07–D24 from that brief on 2026-10-21.

## Problems, with evidence

- A developer stuck on a specific blocker before a release, with the only senior away: 40 minutes of searching, two contradictory Discord answers, and a shipped workaround they "still don't trust"; about half a day. `[INTERVIEW]` research/2026-08-20-interview-working-dev.md
- A Friday-evening Helm upgrade broke staging; an hour of searching and the evening, nobody on internal Slack, a wrong answer on Discord the next day, then a rollback and a release slipped to Tuesday. Frequency unknown: one event. `[INTERVIEW]` research/2026-09-01-interview-backend-dev-fintech.md
- A freelancer under-quoted a server-components migration after two evenings of reading and an "it depends" on Discord: about a week of unpaid time. For estimates he wants a call ("do wyceny rozmowa"), text for bugs. `[INTERVIEW]` research/2026-09-02-interview-freelancer-react.md
- Not every developer has this problem: a platform developer at a 200-person company solved a half-day issue alone and has an internal channel ("kogo. to mnie pytają"). `[INTERVIEW]` research/2026-09-02-interview-platform-dev-solves-alone.md
- In one developer Discord (about 4,000 members), 109 help threads were opened in 14 days; 23 (21%) got no human reply. `[DATA]` research/2026-09-04-discord-help-requests.csv (2026-08-18 to 2026-08-31, bot and job posts removed)
- Of the 86 answered threads, the median first reply came after 67 minutes and 31 got one within 30 minutes. 31 threads carried an urgency signal ("release tomorrow", "prod is down") and 9 of those got no reply. 35 threads ended with the poster saying it was solved. `[DATA]` research/2026-09-04-discord-help-requests.csv
- In the survey of the same community, 30 of 54 were last stuck with nobody to ask this week or this month; 3 had ever paid someone. `[DATA]` research/2026-09-04-survey-discord-willingness-to-pay.md
- Senior engineers spend unpaid time on recurring questions: "two evenings a month, for free, and the notes rot"; another answers weekly DMs for ten minutes from a paste doc and has never charged ("faktury. nie"). `[INTERVIEW]` research/2026-08-22-interview-mentor.md, research/2026-09-03-interview-senior-python-meetups.md
- Trust comes from public work, not ratings: 41 of 54 survey respondents would pick a person by what they built or wrote and 12 by ratings. `[DATA]` research/2026-09-04-survey-discord-willingness-to-pay.md
- Interviewees said the same: "nie senior engineer tylko robiłem upgrade ingress-nginx na 1.28", "każdy ma pięć gwiazdek", "kazdy ma 4.9". `[INTERVIEW]` research/2026-09-01-interview-backend-dev-fintech.md, research/2026-09-02-interview-freelancer-react.md
- That the developer's need is a fast, verified answer rather than learning ("I don't want a course, I want an answer") rests on interviews; how often it recurs per person is unknown (A01). `[INTERVIEW]` research/2026-08-20-interview-working-dev.md

## Product and how it stands out

- What it is: a marketplace of invited senior engineers where a developer books and prepays a 25- or 50-minute text session (Scope). `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md
- What makes it different: text instead of video, public work instead of ratings, and a mentor found through a stack-tag list or their own share link. The comparison below is from dated checks; whether this difference wins bookings is untested (A01, A03).

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|
| Codementor | request-to-live-session path for developer help; mentors vetted | transactional, nothing kept; every card rated 5.0, so ratings carry no information; rates $15–80 per 15 min | 2026-09-04 | https://www.codementor.io/react-experts `[BENCHMARK]` |
| MentorCruise | free intro call before paying; honest about the relationship model | monthly subscription, the model the staff engineer refused | 2026-09-04 | https://mentorcruise.com/ `[BENCHMARK]` |
| Topmate | the expert owns the page, price and audience; one shareable link; 10% commission via own link, 20% via marketplace | any profession; a mentee cannot find the right expert unless they already follow them | 2026-09-04 | https://topmate.io/pricing `[BENCHMARK]` |
| Preply | 25/50-minute lessons; free cancellation up to 12 hours before; refund on a disappointing trial | language tutoring, recurring model, ratings on every card | 2026-09-04 | https://preply.com/en/how-it-works `[BENCHMARK]` |
| ADPList | booking in minutes; session count as a trust signal that is not a rating | free for mentees, nothing stated about mentors earning, career rather than code help | 2026-09-04 | https://adplist.org/ `[BENCHMARK]` |

## Goals and success criteria

- Business goal (1.0): 1.0 ships on 2026-10-31 and works when it holds 10 paid sessions a week for two consecutive weeks by 2026-12-31. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D17), research/2026-09-03-course-reference-product-brief.md
- Warning line (1.0): fewer than 3 paid sessions in the fourth week after ship (the week ending 2026-11-28) stops feature work; the founders interview developers who visited a mentor page and did not book, and decide whether 1.0 continues. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D17, D18)
- Business goal (vault): the board's 100 mentors with a published vault and 30% of mentees on a subscription are not 1.0 targets; the vault returns only after the D22 readout. `[DOCUMENT]` research/2026-09-02-miro-board-product-goals.md
- User outcome (mentee): a developer with a blocker gets a text answer from someone who has done that work, paid upfront, without an account-and-call detour ("nie że zakładam konto, weryfikacja maila, potem czekam"). `[INTERVIEW]` research/2026-09-01-interview-backend-dev-fintech.md
- User outcome (mentee) in 1.0: "within the hour" is not promised; a session starts at least two hours after booking, and the median booking-to-start says whether the urgent job is served. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D09)
- Mentor outcome: a senior engineer is paid for answering questions, with no ratings, setup under twenty minutes and no bank details before the first booking (R07); setup time has no rule or check yet. `[INTERVIEW]` research/2026-09-03-interview-senior-python-meetups.md
- Primary metric: paid sessions per week. Baseline: none, the product does not exist. Threshold: 10 a week for two consecutive weeks by 2026-12-31; a target chosen in the reference brief, not derived from data. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D17)
- Second measurement: median time from booking to session start; above 48 hours in the first four weeks means the urgent job is not served and instant availability moves to the front of 1.1. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D09)
- Supply check: fewer than 5 of the first 20 invited mentors publishing a bookable session within two weeks stops further invitations until the founders interview the decliners. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D13)
- What must not get worse: not applicable before 1.0 ships; no live users or flows exist.

## Scope

- **Now (1.0):** accounts with GitHub sign-in (R11); invited mentors with a mentor page, public work and stack tags, prices within bounds and published slots (R04, R12, R13); finding a mentor through the stack-tag list or a share link (R08); booking a slot at least two hours ahead and paying for a 25/50-minute session through Stripe Checkout (R02, R09, R06, R14); the text session and the written answer (R01); free cancellation up to 24 hours before (R10); a note the mentor drafts and the mentee approves, kept privately (R15, R03); the two founders as the operator (R16). `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D07)
- **First iteration:** 25 hours is the budget of the first iteration, not of all of 1.0; it must leave a bookable, payable, answerable session. Which stories fit is for the backlog; the reference brief's 14-story list was not adopted. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D16)
- **Later:** publishing notes into a vault, vault subscriptions, MCP access, async questions with a 24-hour reply, team plans; no vault work before the D22 readout. `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D07, D22)
- **Not doing:** see Non-goals.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Session | a 25- or 50-minute text exchange about one question; its length is not the waiting time before it starts | mentor and mentee | both |
| Slot | a start time the mentor publishes; bookable only when it starts at least two hours later | mentor | mentees |
| Mentor page | a mentor's shareable page with public work, stack tags, price and open slots | mentor | anyone with the link |
| Mentor list | all mentors filtered by stack tag, ordered by most recent published availability, never by score | platform | everyone |
| Session note | the mentor's write-up after a session; the mentee approves or declines it; kept privately by both | mentor | mentor, mentee |
| Operator | the two founders, doing by hand what has no story yet | founders | internal |
| Vault | Later: a mentor's notes sold as a subscription | mentor | subscribers |

## Key flows

- Current state: a developer stuck before a release checks docs, asks friends and Discord, judges strangers by GitHub, waits for replies, negotiates time and payment by message, and keeps no notes afterwards. This is the founders' journey map built from the 2026-08-20 interview. `[DOCUMENT]` research/2026-09-02-miro-board-journey-current-state.md
- Future state, "Mentor onboarding (1.0)": the operator invites a beachhead engineer in a batch of 20, asking for one bookable session within two weeks (R13); the mentor signs in with GitHub (R11), fills the page with public work and stack tags (R04), sets 25/50-minute prices within bounds (R12), publishes slots, shares the link, and completes Stripe Connect before the first payout (R14). `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md
- Future state, "Booking and session (1.0)": the mentee signs in with GitHub or email; finds a mentor in the stack-tag list or through a share link (R08); picks a slot at least two hours ahead and pays through Stripe Checkout (R02, R06, R09, R14); may cancel free up to 24 hours before (R10); the session runs as text (R01) in a place still open (Q01); the mentor gives the written answer and drafts a note; the mentee approves it in full or declines it with a comment (R15). `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Sessions are text; no video calls; the product says so on every session screen | sessions | `[DOCUMENT]` research/decisions/N01-no-video.md | active | 2026-11-28 (D23) | superseding record by founder A | founder A | none |
| R02 | A session is 25 or 50 minutes | booking | `[DOCUMENT]` research/2026-08-26-workshop-export.md | active | 2026-11-28 (D23) | superseding record by founder A | founder A | none |
| R03 | Nothing from a session is published without the mentee's approval | session notes, later vault | `[DOCUMENT]` research/2026-08-26-workshop-export.md | active | 2026-11-28 (D23) | both founders | founders A and B | none |
| R04 | Every mentor page carries a link to public work and a plain description of what they have done; no scores | mentor page | `[DOCUMENT]` research/decisions/N02-no-ratings.md | active | 2026-11-28 (D23) | superseding record by founder A | founder A | none |
| R05 | A booking needs a written question; the mentor accepts or declines; a decline refunds in full | booking | `[DOCUMENT]` research/decisions/D06-mentor-accepts-after-reading-question.md | superseded | — | — | Łukasz Lasota | none |
| R06 | Payments go through Stripe only, paid before the session | payment | `[DOCUMENT]` research/2026-08-26-workshop-export.md | active | 2026-11-28 (D23) | founder A | founder A | none |
| R07 | A mentor gives no bank details before their first booking | mentor onboarding | `[INTERVIEW]` research/2026-09-03-interview-senior-python-meetups.md | proposal | — | founder A | pending | none |
| R08 | A mentee finds a mentor through the list filtered by stack tag (TypeScript, React, Python, AI agents) or the mentor's share link; ordered by most recent published availability; no search, no ranking | mentor list, pages | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D08) | active | 2026-11-28 (D23); more than 30 published mentors, or mentees unable to find a fit, reopens search for 1.1 | superseding record by founder A | founder A | none |
| R09 | A slot can be booked only when it starts at least two hours after booking; no promise of speed; the time from booking to start is recorded for every booking | booking | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D09) | active | median above 48 h in the first four weeks | superseding record by founder A | founder A | R05 |
| R10 | Free cancellation up to 24 hours before a session; later cancellations forfeit the fee; disputes resolved by the operator; no automatic refunds in 1.0 | bookings, disputes | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D10) | active | 2026-11-28 (D23) | superseding record by founder A | founder A | R05 |
| R11 | Sign-in with GitHub for every role; email and password as the fallback | accounts | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D12) | active | 2026-11-28 (D23) | superseding record by founder A | founder A | none |
| R12 | Each mentor sets their own 25- and 50-minute prices within operator-set bounds; the platform fee is 20% of a session, configurable by the operator | pricing | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D14, D15) | active | 2026-11-28 (D23) | superseding record by founder A | founder A | none |
| R13 | Mentors join by invitation only, in batches of 20 from the beachhead pool; each invitation asks for one bookable session within two weeks | mentor accounts | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D13, D24) | active | two weeks after the first batch accepts | fewer than 5 of 20 publishing stops invitations; superseding record by both founders | founders A and B | none |
| R14 | Stripe Checkout for sessions, Stripe Connect for payouts; a mentor completes Connect onboarding before the first payout | payments, payouts | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D11) | active | 2026-11-28 (D23) | superseding record by founder A | founder A | none |
| R15 | The mentor drafts the session note; the mentee approves it in full or declines it with a comment; the mentor redrafts; no co-editing | session notes | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D20) | active | notes declined twice in a row on one session | superseding record by founder A | founder A | none |
| R16 | An operator action without a story in the current iteration is done by hand by the founders and logged in a shared note | operator actions | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D19) | active | more than one manual action a day for a week | both founders | founders A and B | none |
| R17 | A vault answer always cites the mentor and the note it came from | vault, MCP (Later) | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D21) | active, applies when the vault is in scope | 2026-11-28 (D23) | founder B | founder B | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | video calls | sessions are text; mentees said text is faster | founder A | active | 2026-11-28 (D23) | superseding record by founder A | `[DOCUMENT]` research/decisions/N01-no-video.md | none |
| N02 | ratings or a reviews profile | mentors refuse ratings; public work instead | founder A | active | 2026-11-28 (D23) | superseding record by founder A | `[DOCUMENT]` research/decisions/N02-no-ratings.md | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-08-26 | adopt R02 (25/50-minute sessions) | "bookable in a lunch break" | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/2026-08-26-workshop-export.md | none |
| D02 | 2026-08-26 | adopt R03 (mentee approval before publishing) | "trust is the product" | founders A and B | active | 2026-11-28 (D23) | both founders | `[DOCUMENT]` research/2026-08-26-workshop-export.md | none |
| D03 | 2026-10-21 | Now is text consultations only; vault, MCP, subscription Later | session choice; accepted agent recommendation | Łukasz Lasota | superseded by D07 | — | — | `[DOCUMENT]` research/decisions/D03-now-is-text-consultations.md | none |
| D04 | 2026-10-21 | mentors reached by own link; public list opt-in | session choice | Łukasz Lasota | superseded by D08 | — | — | `[DOCUMENT]` research/decisions/D04-link-plus-opt-in-list.md | none |
| D05 | 2026-10-21 | no response-time promise; earliest open slot | session choice | Łukasz Lasota | superseded by D09 | — | — | `[DOCUMENT]` research/decisions/D05-no-response-time-promise.md | none |
| D06 | 2026-10-21 | adopt R05 (mentor accepts after reading the question) | session choice; accepted agent recommendation | Łukasz Lasota | superseded by D10 | — | — | `[DOCUMENT]` research/decisions/D06-mentor-accepts-after-reading-question.md | none |
| D07 | 2026-10-21 | 1.0 is the session marketplace with a privately kept, mentee-approved note; vault, subscriptions, MCP, team plans and async Q&A are Later | reference brief; adopted by the session owner over D03, choosing the note in Now | founder A | active | 2026-11-28 (D23) | superseding record by founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | D03 |
| D08 | 2026-10-21 | adopt R08 (stack-tag list or share link) | reference brief; replaces the opt-in list of D04 | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | D04 |
| D09 | 2026-10-21 | adopt R09 (two-hour minimum, no speed promise, booking-to-start recorded) | reference brief; gives A04 its measurement | founder A | active | median above 48 h in the first four weeks | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | D05 |
| D10 | 2026-10-21 | adopt R10 (24-hour free cancellation, operator disputes, no automatic refunds); booking is instant, without mentor acceptance | reference brief; chosen by the session owner over D06 | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | D06 |
| D11 | 2026-10-21 | adopt R14 (Stripe Checkout and Connect) | reference brief: one provider end to end | founder A | active | 2026-11-28 (D23); a country Stripe does not serve | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D12 | 2026-10-21 | adopt R11 (GitHub sign-in) | reference brief: "my GitHub is my profile" | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D13 | 2026-10-21 | adopt R13 (invite-only batches of 20 with a two-week check); A02 accepted with the invitation as its test | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A with founder B | active | two weeks after the first batch accepts | both founders | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D14 | 2026-10-21 | mentors set their own prices within operator bounds (R12) | reference brief; answers Q03 | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D15 | 2026-10-21 | platform fee 20% of a session (R12) | reference brief, from the board's 15–20%; answers Q03 | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D16 | 2026-10-21 | 25 hours is the budget of the first iteration, not of all of 1.0; if it does not fit, the iteration is cut, not 1.0 | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D17 | 2026-10-21 | ship 1.0 on 2026-10-31; 10 paid sessions a week for two consecutive weeks by 2026-12-31; fewer than 3 in the fourth week stops feature work | reference brief; answers Q08 (build first) and Q09 | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D18 | 2026-10-21 | A01 (developers pay for a text session) is accepted untested for the first iteration, checked in the fourth week after ship | reference brief: a paid booking is a stronger signal than a stated intention | founder A with founder B | active | 2026-11-28 | both founders | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D19 | 2026-10-21 | adopt R16 (the founders are the operator) | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A with founder B | active | more than one manual action a day for a week | both founders | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D20 | 2026-10-21 | adopt R15 (mentor drafts, mentee approves) | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A | active | notes declined twice in a row | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D21 | 2026-10-21 | adopt R17 (vault answers cite mentor and note) | reference brief; answers Q07 | founder B | active | 2026-11-28 (D23) | founder B | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D22 | 2026-10-21 | founder B runs ten developer interviews on the vault (A05); fewer than 3 who would pay for a named mentor's notes drops the vault; readout 2026-11-30 | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A with founder B | active | 2026-11-30 | both founders | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D23 | 2026-10-21 | every rule and decision without a review date is reviewed at the 1.0 retrospective on 2026-11-28 | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A | active | 2026-11-28 | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |
| D24 | 2026-10-21 | the beachhead is English-speaking TypeScript, React, Python and AI-agent developers; invitations and stack tags come only from that pool | reference brief (agent-recommended on founder A's instruction; not confirmed against this evidence) | founder A | active | 2026-11-28 (D23) | founder A | `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md | none |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Developers with a blocker will pay a stranger for a text session `[ASSUMPTION]` founders | high | 37 of 54 said they would pay something if answered "within an hour, over text", a condition 1.0 does not offer (R09); 3 ever paid; interview prices were "nie wiem. pięćdziesiąt euro?" and below 200 zł; the platform developer would not pay personally | 1.0 has no customer | paid sessions in the first four weeks; fewer than 3 in the fourth week stops feature work (D17); read together with published slots, since low supply also lowers bookings | founders A and B | 2026-11-28 | accepted untested (D18) |
| A02 | Invited mentors join and publish slots `[ASSUMPTION]` founders | high | staff engineer: "nie wsadzajcie mnie na listę obok ludzi, których nie znam", "pewnie powiem nie" and "to zapomnę, że to istnieje" after a quiet month; the Python mentor joins "jak ludzie, których znam"; nobody contacted yet | no supply | fewer than 5 of the first 20 publishing a bookable session within two weeks stops invitations (D13) | founders A and B | two weeks after the first batch accepts | accepted untested (D13) |
| A03 | Mentors' own audiences bring the first mentees `[ASSUMPTION]` board channel plan | medium | 16 of 50 candidates have an own audience, 23 unknown; the Python mentor would send people "jakbym coś z tego miał" | the list must carry discovery | record where each first booking came from | pending | 2026-11-28 | untested |
| A04 | A session booked at least two hours ahead arrives soon enough for the job `[ASSUMPTION]` reference brief | high | the fintech developer: "jak booking trwa więcej niż pięć minut to robię rollback"; Discord median first reply 67 minutes | the urgent job is not served | median booking-to-start above 48 hours in the first four weeks moves instant availability to the front of 1.1 (D09) | founder A | 2026-11-28 | untested; measured, not accepted on record |
| A05 | Mentor notes can later earn as a vault `[ASSUMPTION]` founders' vision | high for the vault, low for 1.0 | two mentors call their notes "the product"; three developers do not want saved answers or subscriptions | the vault is dropped (D22) | ten developer interviews by founder B (D22) | founder B | 2026-11-30 | untested |
| A06 | Mentees approve a draft note, and mentors accept answering without seeing the question first `[ASSUMPTION]` reference brief | medium | two mentors wanted the question first (research/2026-09-03-interview-senior-python-meetups.md, research/2026-09-03-interview-staff-engineer-declined-before.md); no mentee spoke about notes | mentors decline bookings or leave; notes are not approved | approval and decline counts on notes; mentors' reasons for declined or cancelled sessions | founder A | 2026-11-28 | untested |

## Kill criteria

For the session marketplace: fewer than 3 paid sessions in the fourth week after ship (the week ending 2026-11-28) stops feature work and opens a decision on whether 1.0 continues; no record names a result that ends 1.0 itself (Q11). `[DOCUMENT]` research/decisions/D07-D24-adopted-from-course-reference.md (D17)
For supply: fewer than 5 of the first 20 invited mentors publishing a bookable session within two weeks stops further invitations (D13).
For the vault: fewer than 3 of 10 interviewed developers who would pay for a named mentor's notes drops the vault (D22).

## Hypotheses to test

None. No synthetic walkthrough was run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Where does the text session happen: a session screen in DevMentor, or a channel the mentor names with only the written answer in the product? | no for the brief; yes before the session story is implemented | founder A with founder B | open (also open in the reference brief, its Q18) |
| Q02 | No-show and cancellation rules | — | founder A | closed by D10 |
| Q03 | Platform fee and who sets the price | — | founder A | closed by D14, D15 |
| Q04 | If the first iteration omits Connect onboarding and the fee split, are mentors paid by hand under R16 or is payment held? | no for the brief; a backlog-sizing condition, yes before the first payout if that happens | founder A with founder B | open (the reference brief's Q19) |
| Q05 | Does founder A confirm D03–D06? | — | founder A | closed: D03–D06 superseded by D07–D10, owned by founder A in the reference brief |
| Q06 | Who owns terms of service and data processing? The RACI has nobody in legal. | no for build; yes before release on 2026-10-31 | founder A | open |
| Q07 | Does a vault answer cite the mentor and the note? | — | founder B | closed by D21 |
| Q08 | Build first or test manually first? | — | founder A | closed by D17 and D18: build, check four weeks after ship |
| Q09 | Which result reopens the timing and booking decisions? | — | founder A | closed by D09 (median above 48 hours) |
| Q10 | The warning-line check interviews developers who visited a mentor page and did not book: does 1.0 record those visits, or are they reached another way? | no for the brief; decides whether a visit-recording story is in the backlog; yes before 2026-11-28 | founders A and B | open (the reference brief's Q20) |
| Q11 | What result ends the session marketplace itself? | no | founders A and B | open (the reference brief's Q21) |

## Definition of Ready addendum (own)

Problems and Target group rest on seven interviews, one help-channel export and one survey from one community and the founders' networks; both mentee and mentor sides have support. Willingness to pay is stated, not observed: A01 and A02 are accepted untested with dated checks (D18, D13); A04 is measured but has no acceptance record. Every decision Now relies on is active and owned by founder A or both founders, adopted from the reference brief by the session owner. The decisions were adopted by the session owner from the reference brief, which records most of them as the agent's recommendation on founder A's instruction; founder A has not confirmed them against this evidence. Ready for implementation planning of the 1.0 scope; the session story waits for Q01, a visit-recording story depends on Q10, payouts depend on Q04 only if Connect is left out, and release needs Q06. The ship date is ten days away with no mentor contacted; the 48-hour line for A04 is the reference brief's choice and passes medians far above the "within the hour" need.

## Collection plan

### Do invited mentors publish slots, and which conditions make them decline?

- What decision or work needs it: A02, A06 and the D13 check
- Who can answer it: the first batch of 20 mentors with a warm contact (29 candidates in research/2026-09-04-mentor-list.csv)
- How: record sign-ups and published slots within two weeks; interview each mentor who declines or does not publish, and each mentor after their first session
- Owner and by when: founders A and B; two weeks after the first batch accepts
- Template: `research/templates/interview-note.md`, `research/templates/data-request.md`

### Do developers complete a paid booking, and how long do they wait?

- What decision or work needs it: A01, A04 and the D17 warning line
- Who can answer it: developers reaching mentors through the list or share links
- How: record each booking from slot choice to payment, its source, its booking-to-start time, and abandoned bookings with their step
- Owner and by when: founders A and B; the week ending 2026-11-28
- Template: `research/templates/data-request.md`
