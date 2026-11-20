# The mentor drafts a session note; the mentee approves it or declines it with a comment

Status: implemented (branch feat/session-note; autonomous defaults; independent review applied)
Issue: #32 (E04-S02) · Epic: #19 · Depends on: #31 (`.ai/specs/2026-11-20-text-session.md`) · Source: `.ai/specs/product-brief.md` (R15, R03, D20, D02)

## 📝 TLDR
Today a session (#31) ends with a chat transcript and the mentor's written answer, but nothing turns it into an agreed record. Proposed (future behaviour): after a session ends, the mentor writes a note and sends it to the mentee; the mentee approves it as it is, or declines it with a comment; the mentor reads the comment and sends a new version; there is no co-editing. An approved note is visible only to the two of them and published nowhere (R03).

## 📝 Problem Statement
The brief's problem is that help in DMs and calls leaves nothing behind. R15 (D20) decides how a session becomes a lasting record: the mentor drafts, the mentee approves in full or declines with a comment, the mentor redrafts, never co-edited. R03 (D02) forbids publishing anything from a session without the mentee's approval; this story publishes nothing at all, so the approved note is private to the two parties. R15's review trigger is "notes declined twice in a row on one session", so declines must be countable.

## 📝 Proposed Solution
A note is a sequence of **versions** on one session (a confirmed booking). Each version is sent by the mentor and decided once by the mentee:
- The mentor can send a version when the session has ended (`now ≥ ends_at`), no version is waiting for a decision, and no version was approved. The first version is pre-filled with the mentor's written answer when there is one (#31), so the mentor starts from it.
- The mentee approves or declines the latest waiting version. A decline needs a comment (10–2000 characters).
- An approved version is final: the note is done; nothing more can be sent.
- The mentee never edits the text (AC4): the only inputs the mentee has are Approve and Decline with a comment.
- At most 10 versions per session (bounded storage; R15's trigger fires long before).

Only the two parties can read or act (the same party predicate as #31; anyone else: 404). Each step emails the other party a link (never the text): a sent version to the mentee, a decision to the mentor. Every decline emits `sessions.note.declined` with `declineCount` (every version before the waiting or approved one was declined, so the count is "in a row"); at 2 the service also logs a warning for the founders (R15's review trigger, R16) — no automatic action.

**In scope:** `session_note_versions` table and migration; `SessionNoteService` (`get`, `send`, `decide`); `GET /api/sessions/[id]/note`, `POST …/note` (mentor sends a version), `POST …/note/decision` (mentee approves or declines); a "Session note" section on `/sessions/[id]`; emails; events. (A note state on "My sessions" is a follow-up.)
**Out of scope:** saving unsent drafts on the server (the form keeps the text until sent); rich text; publishing or sharing a note (R03; a later vault); the operator reading notes; editing or withdrawing a sent version; notes for cancelled bookings (they have no session).

Alternatives considered:
- **One row with a status, overwritten on redraft.** Rejected: loses the declined text and comments, and R15's "declined twice in a row" cannot be counted.
- **Shared editing (mentor and mentee both edit).** Rejected by R15 (no co-editing).

## 📝 Architecture
- `packages/db/src/entities/sessions/session-note-version.entity.ts` — new; one migration.
- `packages/core/src/services/sessions/session-note.service.ts` — scoped, `{ em, clock, env, logger, events, mailSender }`; reuses `partyWhere` from `session.service.ts`.
  - `get(userId, bookingId)` → `NoteView` (all versions, oldest first, with decisions; `canSend`, `canDecide`, `prefill`).
  - `send(userId, bookingId, { body })` → mentor only (403); 409 `NOTE_NOT_OPEN` before the end, `NOTE_PENDING` while a version waits, `NOTE_APPROVED` after approval, `NOTE_LIMIT` at 10. One transaction: lock the booking row `FOR UPDATE` first, then read the versions (waiting, approved, count, highest number) **inside** that fork, then insert the next version. The unique indexes back it; a violation maps to the same 409s, never a 500.
  - `decide(userId, bookingId, { version, decision, comment })` → mentee only (403); under the same lock, `version` must be the waiting one; a repeat of the decision already recorded on that version is a no-op 200 (double click); anything else 409 `NOTE_NOT_PENDING`.
  - Emails and events run after the transaction commits, best effort (a mail failure is logged, never undoes the step).
- `packages/core/src/http/sessions.ts` — three more handlers; routes under `packages/app/src/app/api/sessions/[id]/note/`.
- `/sessions/[id]` — `SessionNote` section: the mentor's form (`CrudForm`, pre-filled), the mentee's Approve / Decline (comment required), the history.

## 📝 Data Model
`session_note_versions` (new)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| booking_id | uuid not null FK `bookings` `on delete restrict` | |
| version | smallint not null | 1, 2, …; unique with `booking_id`; `CHECK version between 1 and 10` |
| body | text not null | `CHECK char_length(body) between 20 and 20000`; only the two parties see it |
| sent_at | timestamptz not null | |
| decision | text null | `CHECK decision is null or decision in ('approved', 'declined')`; null = waiting |
| decision_comment | text null | `CHECK (decision is not distinct from 'declined') = (decision_comment is not null)` and `CHECK decision_comment is null or char_length(decision_comment) between 10 and 2000` |
| decided_at | timestamptz null | `CHECK (decision is null) = (decided_at is null)` |

The database enforces the state machine too: partial unique indexes `session_note_versions_waiting_uq` on `(booking_id) where decision is null` (one waiting version) and `session_note_versions_approved_uq` on `(booking_id) where decision = 'approved'` (one approved), plus unique `(booking_id, version)`; the service maps each to its 409. Append-only except the one decision per version. `down` refuses while rows exist.

## 📝 API Contracts
| Route | Auth | Input | Answer |
|---|---|---|---|
| `GET /api/sessions/[id]/note` | a party | — | `{ role, versions: [{ version, body, sentAt, decision, decisionComment, decidedAt }], state: 'none' \| 'waiting' \| 'declined' \| 'approved', canSend, canDecide, prefill }`; 404 otherwise |
| `POST /api/sessions/[id]/note` | the mentor + CSRF | `sessionNoteSchema` `{ body: 20–20000, trimmed }` | 200 the note view; 403; 409 `NOTE_NOT_OPEN` \| `NOTE_PENDING` \| `NOTE_APPROVED` \| `NOTE_LIMIT`; 404 |
| `POST /api/sessions/[id]/note/decision` | the mentee + CSRF | `sessionNoteDecisionSchema` `{ version, decision: 'approved' } \| { version, decision: 'declined', comment: 10–2000 }` | 200 the note view; 403; 409 `NOTE_NOT_PENDING`; 404 |

All `Cache-Control: no-store`; error codes additive.

## 📝 UI/UX
- `/sessions/[id]` gains "Session note" below the written answer. Copy states that the note is private to the two of them and published nowhere (R03).
- **Mentor**: before the end, "You can write the note when the session has ended."; then a form pre-filled with the written answer (**Send to the mentee**); while waiting, "Waiting for the mentee's decision"; after a decline, the comment and the form again, pre-filled with the declined text; after approval, the approved note.
- **Mentee**: "No note yet." until a version arrives; then the text read-only with **Approve note** and **Decline** (a dialog with a required comment); after deciding, the state; after approval, the approved note.
- History: earlier versions and their comments, listed under the current one.

## 📝 Edge Cases & Failure Scenarios
- Two sends at once (two tabs) → the booking row lock serializes them; the second sees a waiting version → 409 `NOTE_PENDING`.
- The mentee decides twice (double click) → the second carries the same version and decision → 200, nothing changes; a different decision on a decided version → 409 `NOTE_NOT_PENDING`.
- The mentee never decides → the note waits; the mentor sees "Waiting for the mentee's decision" (accepted for 1.0; no reminder).
- The mentor sends after approval → 409 `NOTE_APPROVED`.
- The eleventh version → 409 `NOTE_LIMIT`; the mentee can report the booking (#30); the mentor writes to the operator by email (R16). The page says so.
- A third user → 404 on every route.
- Email fails → logged; the note state is stored.
- No written answer → the first form starts empty.

## 📝 Risks & Impact Review
`risk-medium`: one additive table, three routes, private free text. The party predicate is shared with #31; role checks (mentor sends, mentee decides) are tested per route. Nothing is published (R03).

## 📝 Decisions in play
R15/D20 (mentor drafts, mentee approves in full or declines with a comment, mentor redrafts, no co-editing; review trigger: declined twice in a row), R03/D02 (nothing published without approval — nothing is published here).

## Resolved assumptions (autonomous defaults)
| # | Question | Default applied | Rationale |
|---|---|---|---|
| Q1 | When can the mentor write the note? | After the session's end, no deadline | AC1 "a finished session" |
| Q2 | Server-side drafts? | No; a version is sent in one step | Least state; the form holds unsent text |
| Q3 | Start from the written answer? | Yes, as the first pre-fill | The answer is the substance; less retyping |
| Q4 | How many versions? | 10 | Bounded; R15's trigger fires at two declines |
| Q5 | Comment required on decline? | Yes, 10–2000 chars | AC2 "declines with a comment" |
| Q6 | Notifications? | Email the other party a link on send and on decision | Each step waits on the other person |
| Q7 | R15 review trigger? | `sessions.note.declined` per decline with `declineCount`, and a warning log at 2; no automatic action | The founders review by hand (R16) |
| Q8 | A note nobody decides? | It waits; no reminder | Least surface for 1.0 |

## 📋 Phasing
One phase (one PR): the model is small and each step depends on the previous.

## 📋 Implementation Plan
1. Migration + entity (`session_note_versions`, CHECKs, unique); entity tests.
2. `sessionNoteSchema`, `sessionNoteDecisionSchema`; `SessionNoteService` (`get`, `send`, `decide`) with the lock, roles, states, emails, events; unit tests incl. a third user, double decide, limit, prefill.
3. Routes and handler tests.
4. `SessionNote` on `/sessions/[id]`; component tests.
5. Integration: session ends → mentor sends → mentee declines with a comment → mentor sees it and sends version 2 → mentee approves → both see it, a third user 404, emails, constraints.
Each step ends with `npm run validate` green at 100% coverage; steps 1 and 5 run `npm run test:integration`.

## Implementation notes
- `declineCount` is the declined version's number: a new version is sent only after a decline, so declining version n is the n-th decline in a row.
- `NOTE_LIMIT_MESSAGE` names the limit as a literal (a test pins it to `NOTE_MAX_VERSIONS`): module scope in `core` must not read `@devmentor/db` values, because the entry tests mock that package.
- The decline form is a plain form, not `CrudForm`: its schema is a discriminated union, and `CrudForm` takes an object schema.

