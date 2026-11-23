# Mentor and mentee hold the session in text in DevMentor; the mentor gives a written answer

Status: implemented (branch feat/text-session) — Q01 answered on 2026-11-20 by the session owner (Łukasz Lasota, who signs the brief's Definition of Ready): the session happens in DevMentor; founders A and B to record it in the brief
Issue: #31 (E04-S01) · Epic: #19 · Depends on: #29 (`.ai/specs/implemented/2026-11-20-booking-stripe-checkout.md`), #30 (`.ai/specs/implemented/2026-11-20-booking-cancellation.md`) · Feeds: #32 (the note) · Source: `.ai/specs/product-brief.md` (R01, N01, R03, Q01)

## 📝 TLDR
Today a paid booking (#29) ends at "Booked": nothing in DevMentor lets the two people actually talk, and what they say would vanish anyway ("nothing survives the call"). Proposed (future behaviour): at the booked start time, the mentee and the mentor open `/sessions/[id]` and exchange text messages in DevMentor; every session screen says the session is text, with no video (R01, N01); the mentor submits a written answer, which the mentee reads afterwards. Only the two parties can open a session. A "My sessions" page lists both sides' sessions.

## 📝 Problem Statement
The brief's core problem is that help given in DMs and calls leaves nothing behind (research/2026-08-22 interview). R01 makes the session text-only and requires every session screen to say so. Q01 asked where the text exchange happens; the owner answered "in DevMentor" on 2026-11-20, so the exchange and the answer are kept and can feed the mentee-approved note (#32, R15, R03). Without this story a mentee pays for a time and has nowhere to use it.

## 📝 Proposed Solution
A session is a confirmed booking (no new aggregate): its id is the booking id. Two new tables keep what is said: `session_messages` (the chat) and `session_answers` (one written answer per session, from the mentor). `SessionService` decides who may read and write, and when:
- **Who**: exactly the booking's mentee and the mentor who owns the booked profile; anyone else gets 404 (AC4), the same answer as an unknown id. One predicate serves every read and write: `{ id, status: 'confirmed', $or: [{ mentee: userId }, { mentorProfile: { user: userId } }] }`; the caller's role is then `mentee` when `booking.mentee = userId`, else `mentor`.
- **When**: the page opens any time for the two parties; messages can be sent from `starts_at` until `ends_at + 30 min` (a short wrap-up), after which the chat is read-only (AC1). The written answer can be submitted from `starts_at` until `ends_at + 24 h`, once (AC3).
- **Which bookings**: only `confirmed`. A cancelled or unpaid booking has no session (404). A booking can be cancelled only before it starts (#30), and messages only after, so a cancelled booking never has messages.

Messages reach the other person by **polling**: the page asks `GET /api/sessions/[id]?after=<seq>` for messages after the last sequence number it has, every 3 seconds while the chat is open (and stops when it is read-only or the tab is hidden). There is no WebSocket/SSE infrastructure in this project (no worker, serverless-friendly build); polling a small indexed query is enough for one-to-one text at 1.0 volume and is the most reversible choice.

**In scope:** `SessionMessage`, `SessionAnswer` entities and migration; `SessionService` (`get`, `send`, `answer`, `listMine`); `GET /api/sessions/[id]`, `POST /api/sessions/[id]/messages`, `POST /api/sessions/[id]/answer`; `/sessions` ("My sessions", both roles) and `/sessions/[id]` (chat, answer form for the mentor, answer view for the mentee); links from `/bookings/[id]` and `/mentor/slots`; "My sessions" in the account nav; an email to the mentee when the answer is submitted; the R01 statement on every session screen.
**Out of scope:** the note (#32); attachments, code formatting beyond plain text with preserved line breaks, editing or deleting messages; read receipts, typing indicators, push notifications or emails per message; reminders before the start; the operator reading sessions (disputes use the report from #30); video or audio of any kind (N01).

Alternatives considered:
- **WebSocket/SSE.** Rejected for 1.0: new infrastructure (a long-lived connection layer the deployment does not have) for a one-to-one chat; polling can be swapped for SSE later behind the same read endpoint.
- **A mentor-named channel (Slack, Discord) with only the answer in DevMentor.** Rejected by the owner's Q01 answer: the exchange would leave the product, which is the problem the brief names.
- **A `sessions` table with its own lifecycle.** Rejected: a session is fully determined by its confirmed booking; a second state machine would only duplicate booking status.

## 📝 Architecture
- `packages/db/src/entities/sessions/session-message.entity.ts`, `session-answer.entity.ts` — new; one migration.
- `packages/core/src/services/sessions/session.service.ts` — scoped, `{ em, clock, env, logger, events, mailSender }`:
  - `get(userId, bookingId, { after? })` → `SessionView` (role, times, window flags, messages with `seq > after`, the answer); 404 unless the party predicate matches.
  - `send(userId, bookingId, { body })` → the stored message; in one transaction holding the booking row `FOR UPDATE` (so sends of one session commit in `seq` order and the cap holds); 409 `SESSION_NOT_OPEN` outside the message window; 409 `SESSION_FULL` at 500 messages.
  - `answer(userId, bookingId, { body })` → the answer; mentor only (403 for the mentee), 409 `ANSWER_NOT_OPEN` outside its window, 409 `ALREADY_ANSWERED` (unique per booking, backed by the index); after commit `sessions.answer.submitted` and an email to the mentee with a link only, never the body (best effort).
  - `listMine(userId)` → the caller's confirmed bookings as mentee or as mentor, upcoming first, then past.
- `packages/core/src/http/sessions.ts` — `apiHandler` handlers; routes under `packages/app/src/app/api/sessions/`.
- `packages/app/src/app/(mentee)/sessions/` — `page.tsx` (list) and `[id]/page.tsx` (session), guarded by `requirePageSession`; mentors reach them through the same group (every user has the `mentee` role). Client parts: `SessionChat` (polling, composer), `AnswerForm` (`CrudForm`).
- `packages/ui/src/components/auth/accountNav.ts` — "My sessions" (`/sessions`).

Takeaway: the session reuses the booking for identity and access, adds two append-only tables, and moves messages by polling one indexed read.

## 📝 Data Model
`session_messages` (new)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| seq | bigint generated always as identity | the polling cursor; sends of one booking are serialized by its row lock, so a reader that has seen `seq = n` has seen every committed message of that booking up to `n` |
| booking_id | uuid not null FK `bookings` `on delete restrict` | |
| author_id | uuid not null FK `users` `on delete restrict` | mentee or mentor of the booking (checked in the service) |
| body | text not null | `CHECK char_length(body) between 1 and 4000`; free text about people: shown only to the two parties, never logged |
| created_at | timestamptz not null | |

Index `(booking_id, seq)` for the polling read (`seq > after order by seq`). `created_at` is display only.

`session_answers` (new)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid not null unique FK `bookings` `on delete restrict` | one answer per session |
| author_id | uuid not null FK `users` | the mentor |
| body | text not null | `CHECK char_length(body) between 20 and 20000` |
| submitted_at | timestamptz not null | |

Both append-only; rows are never edited or deleted (they are the record #32 drafts from). `down` refuses while rows exist.

## 📝 API Contracts
| Route | Auth | Input | Answer |
|---|---|---|---|
| `GET /api/sessions/[id]` | a party | `?after=<seq>` (optional non-negative integer; anything else 400; a number past the end returns no messages) | `{ role: 'mentee' \| 'mentor', startsAt, endsAt, messagesUntil, answerUntil, canSend, canAnswer, otherParty: { displayName }, messages: [{ id, seq, mine, body, createdAt }], answer: { body, submittedAt } \| null }`; 404 otherwise |
| `POST /api/sessions/[id]/messages` | a party + CSRF | `sessionMessageSchema` `{ body: string 1–4000, trimmed }` | 200 the message; 409 `SESSION_NOT_OPEN`, `SESSION_FULL`; 404 |
| `POST /api/sessions/[id]/answer` | the mentor + CSRF | `sessionAnswerSchema` `{ body: string 20–20000, trimmed }` | 200 the answer; 403 mentee; 409 `ANSWER_NOT_OPEN`, `ALREADY_ANSWERED`; 404 |

All `Cache-Control: no-store`. `messages` without `after` returns the whole conversation (at most 500). New error codes are additive.

## 📝 UI/UX
- Every session screen (`/sessions`, `/sessions/[id]`) carries "Sessions are text — no video call." (R01).
- **`/sessions`** ("My sessions"): two lists, "Upcoming" and "Past", each row: other party, length, local time, state ("Opens at …", "Open now", "Answer received", "Waiting for the answer", "Cancelled"), link to the session.
- **`/sessions/[id]`**, before the start: "This session opens at <local time>." and nothing to type.
- **During the message window**: the conversation (own messages on one side, the other party's on the other, line breaks kept, local times), a composer (textarea, **Send**, Ctrl/Cmd+Enter), errors under it. New messages appear within a few seconds. A live region announces new messages from the other party.
- **After the window**: "The chat is closed." The conversation stays readable.
- **Mentor**: below the chat, "Your written answer" (`CrudForm` textarea, **Submit answer**, a reminder that it is sent once and the mentee is emailed) until submitted, then the answer read-only.
- **Mentee**: "Written answer" section: "The mentor's written answer will appear here." until submitted, then the answer.
- `/bookings/[id]` (confirmed) and `/mentor/slots` (Booked) link to the session. `/mentor/slots` is in the `(mentor)` group, which has its own root layout, so that link is a full page load (accepted).
- The mentee's session page links to **Report a problem** on `/bookings/[id]` (#30) for a no-show or a missing answer.

## 📝 Edge Cases & Failure Scenarios
- A third user (even the other mentee of the same mentor, or the operator) opens `/sessions/<id>` → 404, same as an unknown id (AC4).
- Sending before the start or after the window → 409 `SESSION_NOT_OPEN`; the page also hides the composer.
- The booking is cancelled before the start → 404 from then on; it never had messages.
- Two quick sends (one person in two tabs, or both people at once) → the booking row lock serializes them; each gets the next `seq`; a poll between them sees the first only and the next poll the second, never skipping one.
- The mentor does not show up or never answers → the mentee reports it (#30, AC3); the operator decides by hand (R10, R16).
- Validation errors and logs never echo a message or answer body.
- A poll fails (network) → the page keeps the last messages, shows "Reconnecting…", and retries on the next tick.
- The mentor submits the answer twice (double click, two tabs) → one stored, the second gets `ALREADY_ANSWERED` and the page shows the stored one.
- The answer email fails → logged; the answer is stored and shown.
- A very chatty session → 500 messages cap, then `SESSION_FULL`.
- Clock: windows use the server clock; the page shows local times from the server's ISO instants.

## 📝 Risks & Impact Review
`risk-medium`: two new tables (additive), new routes, personal free text. The access rule is the security boundary: one predicate (`party of the booking`) used by every read and write, with tests for a third user on each route. Polling load: one indexed query per open session every 3 s; acceptable at 1.0 volume, swap for SSE if sessions grow. No money moves.

## 📝 Decisions in play
R01/N01 (text only; said on every session screen), Q01 (answered: in DevMentor — the brief's Q01 can be closed by founder A with founder B), R03 (nothing published without the mentee's approval — nothing here is published), R15 (the note is #32, drafted from this record).

## Resolved assumptions (autonomous defaults)
| # | Question | Default applied | Rationale |
|---|---|---|---|
| Q1 | Where does the session happen? | In DevMentor (owner, 2026-11-20) | Answered Q01 |
| Q2 | Real-time transport? | Polling every 3 s, paused when hidden or closed | No new infrastructure; reversible behind the same read |
| Q3 | When can messages be sent? | From `starts_at` to `ends_at + 30 min` | AC1 "at its start time"; a short wrap-up without an open-ended chat |
| Q4 | When can the answer be submitted, and how often? | From `starts_at` to `ends_at + 24 h`, once, no edits | AC3; edits belong with the note (#32) |
| Q9 | Cursor? | A `seq` identity column, sends serialized per booking by the booking row lock | A timestamp or random-id cursor can skip a message committed late (review finding) |
| Q5 | Who can read a session? | The two parties only (not the operator) | AC4; disputes go through #30's report |
| Q6 | How do people find their sessions? | "My sessions" page plus links from the booking page and `/mentor/slots` | No mentor bookings list exists yet |
| Q7 | Notifications? | One email to the mentee when the answer is submitted; none per message | Least noise; the answer is the outcome the mentee waits for |
| Q8 | Limits? | Message 1–4000 chars, answer 20–20000, 500 messages per session | Bounded storage and abuse without a rate limiter |

## 📋 Phasing
- **Phase 1 — Session read and messages** (AC1, AC2, AC4): entities and migration, `SessionService.get/send/listMine`, routes, `/sessions`, `/sessions/[id]` with polling chat, links, nav, integration test.
- **Phase 2 — Written answer** (AC3): `answer`, route, answer form and view, email, integration test.

## 📋 Implementation Plan
1. Migration + entities (`session_messages`, `session_answers`, CHECKs, index, unique); entity tests; schema checks in integration.
2. `sessionMessageSchema`, `sessionAnswerSchema`; `SessionService` `get` (party predicate, windows, `seq` cursor), `send` (booking row lock, cap), `listMine`; unit tests incl. a third user, a mentor who is also a mentee of another booking, window edges, cap.
3. Routes `GET /api/sessions/[id]`, `POST …/messages` with handler tests (401, 404 third user, 409 codes, CSRF, no-store).
4. `/sessions` list and `/sessions/[id]` page with `SessionChat` (polling, composer, live region, R01 line, "Reconnecting…" on a failed poll); nav item; links from `/bookings/[id]` and `/mentor/slots`; component tests with an injected fetch.
5. Integration: book and pay (stub), move the start into the past in the DB, mentee and mentor exchange messages in two browsers, a third user gets 404, closed window refuses.
6. `answer` + route + `AnswerForm`/answer view + email; unit, handler and component tests.
7. Integration: mentor submits the answer, mentee sees it and gets the email, second submit refused.
Each step ends with `npm run validate` green at 100% coverage; steps 1, 5 and 7 run `npm run test:integration`.

## Implementation notes
- `SessionView` carries `phase` (`not_started` | `open` | `closed`) so the page never reads the clock while rendering; polling stops once the chat is closed.
- `seq` is mapped as a generated identity (`generated('identity')`); `autoincrement()` only makes it optional on create, with the column type pinned to `bigint`.
- Mentors reach their sessions through "My sessions" (and the email links); a session link on `/mentor/slots` was left out, since the owner slot view carries no booking id and the nav already covers it.
- The mentee is shown to the mentor by GitHub login (or "Your mentee"); no email address is exposed in the session.

