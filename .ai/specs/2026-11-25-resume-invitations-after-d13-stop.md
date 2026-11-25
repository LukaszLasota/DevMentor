# An operator resumes invitations after the D13 stop, with the decision on record

Status: draft (2026-11-25, lesson 25), awaiting the owner's approval. Not implemented.
Source: Q1 of `.ai/specs/implemented/2026-11-24-invitation-batches.md` ("Who lifts the D13 stop, and how?") · Brief: `.ai/specs/product-brief.md` (R13, D13, A02; also R16, D19, D28)
Extends: .ai/specs/implemented/2026-11-24-invitation-batches.md

## 📝 TLDR
The invitation-batches spec stops invitations when batch 1 is decided with fewer than 5 of 20 mentors publishing a slot (D13). The stop lifts only when batch 1 has `resumedAt`, and nothing in the product writes it, so after a stop the only way out today is a hand-written SQL update. R13 and the stop message say what should happen instead: the founders interview the decliners and decide whether to continue. This spec adds one operator action, "Resume invitations", on `/admin/invitations`. It is shown only while invitations are stopped, takes a required reason that names the founders' recorded decision, writes `resumedAt`, `resumedBy` and the reason on batch 1 in one locked transaction, and logs it. After that, batches open and invitations go out as before; the stop does not re-arm.

## 📝 Problem Statement
- Today a stop is final in the product: `stopState` lifts it only through `batch1.resumedAt` (`packages/core/src/services/invitations/invitation-batch.rules.ts:80-87`), and no code path writes `resumedAt` (only the schema test does, `packages/app/integration/invitation-batches-schema.test.ts:104`).
- The brief says the stop holds "until the founders interview the decliners" (brief, Constraints, supply check; R13 kill signal "superseding record by both founders"). So the product is stricter than the decision: once the founders decide to continue, an operator would have to edit the database by hand. That is an unlogged write with no reason recorded, which is exactly what the stop rule should make visible.
- The stop message already tells the operator "Interview the decliners first.", which implies a "then" the product does not offer.

## 📝 Proposed Solution
A new method `InvitationBatchService.resume(user, input)` and a route `POST /api/admin/invitation-batches/resume`. In one transaction it locks batch 1 (`SELECT … FOR UPDATE`), recomputes the stop with the injected `Clock`, refuses when invitations are not stopped, and otherwise sets `resumedAt = now`, `resumedBy = user` and `resumeReason = input.reason` on batch 1. After the commit it logs one 'Operator action' line `invitation-batch.resume`. The overview gains a `resumed` block, so the page shows who resumed, when, and why. No CLI command: like opening a batch, resuming is a page-only operator action.

### Alternatives considered
- *Keep it in SQL, documented in the README.* Lost: no reason, no log line, and an operator writes `resumed_by_id` by hand; it is the gap this spec closes.
- *Require both founders to confirm (two operator clicks).* Lost for now: R13 names both founders as owners of the decision, but the decision itself is recorded in the brief, where both are named. The product records the operator who acted and the reason that points to that record. See Q1.
- *A CLI `npm run invite -- resume`.* Lost: the CLI never opens batches (invitation-batches rule 2); resuming is the same kind of action and stays on the page, behind a session with the operator role.

## 📝 Prior spec drift
Compared `.ai/specs/implemented/2026-11-24-invitation-batches.md` with the code it describes, limited to the stop rule, the overview and the batch entity that this spec touches.
- Rules, rule 5 "Batch 1 is *decided* when it holds 20 invitations": the code checks `statuses.length >= INVITATION_BATCH_SIZE` (`invitation-batch.rules.ts:83`). Same result while batches are capped at 20 (the cap is enforced in `assertCanInvite`, `invitation-batch.service.ts:225-245`); not material.
- Rule 5 "Nothing in this spec sets `resumedAt`": in sync; no production code writes it.
- Data Model, `resumed_at` / `resumed_by_id` with the paired check: in sync (`packages/db/src/entities/invitations/invitation-batch.entity.ts:19`, `:44-45`).
- API Contracts, `InvitationOverview`: in sync (`invitation-batch.service.ts:70-80`); it has no resume information, which this spec adds.
- UI/UX, "Stopped: a destructive `Alert` with the stopped message word for word. No form, no open button.": in sync (`packages/app/src/app/(admin)/admin/invitations/InvitationsBoard.tsx:109-113`).
- Outside the spec: the brief (supply check, R13) says the stop lasts "until the founders interview the decliners", the code makes it permanent. This is the gap of the Problem Statement, not drift to restore.

No material drift; the prior spec stays fully valid, so the relation is `Extends`.

## 📝 Rules
R1. **Resume.** An operator can resume invitations only while they are stopped (invitation-batches rule 5, evaluated at the injected clock's now inside the locked transaction). Resuming sets on batch 1, together: `resumedAt = now`, `resumedBy = the operator`, `resumeReason = the reason`. Otherwise the request is refused with 409 `INVITATIONS_NOT_STOPPED` and writes nothing.
R2. **Reason.** The reason is required, trimmed, 10 to 500 characters, plain text. The form asks for the decision that allows it, for example "D31: interviewed 6 of 16 decliners, both founders agree to continue". The product does not check that the brief row exists.
R3. **Once.** The stop is evaluated on batch 1 only (unchanged), so after a resume it never applies again; later batches have no stop rule (R13 and D13 name the first 20). A second resume is refused by R1 because invitations are no longer stopped.
R4. **Nothing else changes.** Resuming does not open a batch, reopen batch 1, re-arm expired invitations or change any status. The operator opens the next batch with the existing action.

## 📝 Delta

### Capability: invitation-batches

#### MODIFIED Requirement: D13 stop
The system SHALL refuse new invitations and new batches once batch 1 is decided with fewer than 5 "Published a slot", until an operator resumes invitations (rule R1), which sets `resumedAt` on batch 1.

##### Scenario: 4 of 20, not resumed
- WHEN batch 1 is decided with 4 publishers and nobody has resumed
- THEN creating an invitation or opening a batch answers 409 with the stopped message and the page shows the banner with the "Resume invitations" action, without form or open button

##### Scenario: 4 of 20, resumed
- WHEN batch 1 is decided with 4 publishers and an operator has resumed
- THEN invitations are not stopped, the next batch can be opened and the page shows who resumed, when and the reason

Frozen by: `packages/core/src/services/invitations/invitation-batch.rules.test.ts` ("stops when batch 1 is decided with 4 publishers", "is lifted by resumedAt and absent without a batch 1"), `packages/app/integration/invitation-batches.test.ts` ("batch 1 decided with 4 publishers: resend, create and open are refused, the row and the stop are unchanged"), `packages/app/integration/invitation-batches-browser.test.ts` (TC-INV-003)

#### ADDED Requirement: Resume invitations after the D13 stop
The system SHALL let an operator resume invitations while they are stopped, with a required reason, and SHALL refuse to resume when they are not stopped.

##### Scenario: Resume while stopped
- WHEN invitations are stopped and an operator submits "Resume invitations" with a 10–500 character reason
- THEN batch 1 gets `resumedAt`, `resumedBy` and the reason in one write, the answer is 200 with the resume record, and the page shows the open-batch prompt

##### Scenario: Resume when not stopped
- WHEN invitations are not stopped (batch 1 undecided, decided with 5 or more, already resumed, or no batch 1) and an operator resumes
- THEN the answer is 409 `INVITATIONS_NOT_STOPPED` "Invitations are not stopped." and nothing is written

##### Scenario: Two operators resume at once
- WHEN two operators resume at the same moment
- THEN one succeeds and the other, after the lock, finds batch 1 resumed and gets 409 `INVITATIONS_NOT_STOPPED`; batch 1 keeps the first operator's record

##### Scenario: Reason too short
- WHEN the reason is empty, only spaces, or shorter than 10 characters after trimming
- THEN the form shows "Name the decision that allows resuming (at least 10 characters)." and sends no request; the route answers 400 `VALIDATION_ERROR` to a direct request

#### MODIFIED Requirement: Operator actions are logged
The system SHALL log every operator action of the invitation-batches spec and of this spec with the T-14 pattern `logger.info({ operator: { id }, action, target }, 'Operator action')`: `invitation-batch.open`, `invitation.create`, `invitation.resend` as before, and new `invitation-batch.resume` (target `{ batch: { number: 1 } }`); and SHALL log a refused resume as `{ operator, action: 'invitation-batch.resume', refused: 'INVITATIONS_NOT_STOPPED' }` with 'Operator action refused'. No log line carries the reason, token, token hash, link or invited email.

##### Scenario: Resume logged
- WHEN an operator resumes invitations
- THEN one line `{ operator: { id }, action: 'invitation-batch.resume', target: { batch: { number: 1 } } }` 'Operator action' is logged after the commit, without the reason

Frozen by: `packages/core/src/services/invitations/invitation-batch.service.test.ts` (the `invitation-batch.open` log and the 'Operator action refused' line while stopped), `packages/core/src/services/invitations/invitation.service.test.ts` (the `invitation.create` and `invitation.resend` logs)

## 📝 Architecture
- `packages/db`
  - (changed) `entities/invitations/invitation-batch.entity.ts` — `resumeReason: p.text().nullable()`; the paired check becomes `(resumed_at is null) = (resumed_by_id is null) and (resumed_at is null) = (resume_reason is null)`.
  - (new) migration `Migration2026112…` — add `resume_reason text null`, replace the check constraint; `down` restores the old check and drops the column. Additive; no row has `resumed_at` today.
- `packages/core`
  - (changed) `services/invitations/invitation-batch.service.ts` — `resume(user, input)`: operator check → transaction → `findOne(InvitationBatch, { number: 1 }, lockForUpdate())` → `null` ⇒ not stopped → evaluate the stop on batch 1's rows with the same `evaluate` + `stopState` as `isStopped` → not stopped ⇒ refused log + 409 → set the three fields → flush → commit → log. `overview` gains `resumed`.
  - (changed) `services/invitations/invitation-batch.rules.ts` — constants `INVITATIONS_NOT_STOPPED_MESSAGE`, `RESUME_REASON_MIN = 10`, `RESUME_REASON_MAX = 500`.
  - (new) `validators/invitations/invitation-resume.schema.ts` — `invitationResumeSchema = z.strictObject({ reason: z.string().trim().min(10, …).max(500, …) })`.
  - (changed) `http/invitation-batches.ts` — handler `resumeInvitations` (`requireSession`, `requireRole(user, 'operator')`, `parseJsonBody(invitationResumeSchema)`), exported from `@devmentor/core/http`.
- `packages/app`
  - (new) `src/app/api/admin/invitation-batches/resume/route.ts` — `export const POST = apiHandler(resumeInvitations, …)`.
  - (changed) `src/app/(admin)/admin/invitations/InvitationsBoard.tsx` — "Resume invitations" button in the stopped banner, alert dialog with the reason field; the "Resumed" note when `overview.resumed` is set.
- `packages/ui` — no new component; the dialog uses the existing `AlertDialog` and `CrudForm` field types.

## 📝 Data Model
`invitation_batches` (changed)
| Column | Type | Notes |
|---|---|---|
| resume_reason | text null | new; set only with `resumed_at` and `resumed_by_id` (check `invitation_batches_resumed_pair_check`, extended to the three columns) |

Only batch 1 is ever written by `resume`. The columns stay on every batch (unchanged shape); no index.

## 📝 API Contracts
`POST /api/admin/invitation-batches/resume` — `apiHandler` (CSRF on), `requireSession` (401), `requireRole(user, 'operator')` (403); the service repeats the operator check. `Cache-Control: no-store`.

| Request | Success | Refusals |
|---|---|---|
| `{ reason: string }` | 200 `{ resumedAt, resumedBy: { id, name }, reason }` | 400 `VALIDATION_ERROR`, 409 `INVITATIONS_NOT_STOPPED`, 401, 403 |

`InvitationOverview` (additive): `resumed: { at: string; byName: string; reason: string } | null` — `byName` through `mentorNameForOperator`-style fallback (display name, else the operator's email). `stopped` and `canOpen` keep their meaning; after a resume `stopped` is `false`.

Refusal messages, word for word:
| Case | Status, code | Message |
|---|---|---|
| not stopped (incl. already resumed, no batch 1) | 409 `INVITATIONS_NOT_STOPPED` | Invitations are not stopped. |
| reason missing or too short | 400 `VALIDATION_ERROR` | Name the decision that allows resuming (at least 10 characters). |
| reason too long | 400 `VALIDATION_ERROR` | Keep the reason under 500 characters. |

## 📝 UI/UX
On `/admin/invitations`:
- **Stopped:** the existing destructive `Alert` with the stopped message, plus a button "Resume invitations". It opens an alert dialog: title "Resume invitations?", text "Invitations are stopped because fewer than 5 of the first 20 published a slot. Resume only after the founders have interviewed the decliners and recorded the decision.", a required textarea "Decision" (hint: "Name the decision, e.g. D31, and what it says."), buttons "Resume invitations" and "Cancel". A 409 shows in the dialog as an error and the overview reloads.
- **Resumed:** after a resume, above the batch list, a neutral note: "Invitations resumed on <date, viewer time zone> by <name>: <reason>". The rest of the page follows the existing states (open-batch prompt, invite form).
- Batch 1's state label follows the existing rule: "Full" once not stopped.

## 📝 Edge Cases & Failure Scenarios
- No batch 1, batch 1 undecided, decided with 5 or more: not stopped → 409, nothing written.
- Resume, then a batch-1 invitation status changes (a slot removed, time passes): the stop stays lifted (`resumedAt` set); R3.
- Concurrent resume: the batch-1 lock serialises; the loser re-evaluates and finds `resumedAt` set → 409.
- A resume racing a `create`: `create` evaluates the stop before and after the open-batch lock (unchanged). There is no open batch while stopped (opening is refused), so no `create` can be in flight.
- Reason with markup: stored and shown as text (React escapes it); never logged.
- Clock: `resumedAt` comes from the injected `Clock`, like every other time in the feature.

## 📝 Risks & Impact Review
- **Wrong person resumes.** Any operator can resume; operators are the two founders (D19, `OPERATOR_EMAILS`). Mitigation: required reason naming the decision, the log line, and the visible note on the page. Q1 asks whether two operators must confirm.
- **Resume without the interviews.** The product cannot verify them; the reason and the brief row are the control. Medium, accepted.
- **Migration.** Additive column and a widened check; `down` restores the old check. Low.
- **Backward compatibility.** `InvitationOverview` gains a field; the new route is new; no existing contract changes (`BACKWARD_COMPATIBILITY.md`).

## 📝 Decisions in play
R13 / D13 / A02 (the stop and who lifts it; owners: both founders), R16 / D19 (the founders are the operators), D28 (what counts as published). When Q1 is answered, the implementation PR records the answer in the brief as a new decision row (lesson 2026-11-23). A real resume is itself a founders' decision and gets its own brief row before anyone clicks the button.

## ✅ Acceptance criteria
- AC1 Given batch 1 decided with 4 publishers, when an operator resumes with a valid reason, then batch 1 has `resumedAt`, `resumedBy` and the reason, the page shows the "Resumed" note and the "Open batch N" prompt, and one `invitation-batch.resume` line is logged without the reason.
- AC2 Given invitations are not stopped (each of: no batch 1, batch 1 undecided, decided with 5, already resumed), when an operator resumes, then the answer is 409 `INVITATIONS_NOT_STOPPED` and batch 1 is unchanged field by field.
- AC3 Given a mentor or mentee session, when they POST the resume route with a valid reason, then the answer is 403 and batch 1 is unchanged field by field; without a session 401 (three access-control checks, AGENTS.md).
- AC4 Given two concurrent resumes, then exactly one succeeds and batch 1 holds that operator's record.
- AC5 Given a reason shorter than 10 characters after trimming or longer than 500, then the form shows the message under the field and sends no request, and a direct request gets 400.

## 🧪 Tests
- `invitation-batch.rules.test.ts` — unchanged cases stay green (they freeze rule 5); new: the message constants.
- `invitation-batch.service.test.ts` — `resume`: stopped → writes the three fields and logs `invitation-batch.resume` without the reason; not stopped in each variant → 409 and refused log; non-operator 403; overview `resumed` null and set (name fallback to email).
- `invitation-resume.schema.test.ts` — trim, 9/10/500/501 characters, unknown field refused.
- `http/invitation-batches.test.ts` — the route handler: 401, 403, 400, 409, 200 shape, `no-store`.
- `InvitationsBoard` tests — banner with the button while stopped; dialog validation; the "Resumed" note.
- Integration `invitation-batches.test.ts` — batch 1 decided at 4 publishers → resume → open batch 2 and create succeed; resume again → 409; concurrent resume over several rounds with a 0–9 ms stagger (lesson 2026-11-14); a mentor's resume is denied and batch 1 re-read field by field.
- Integration browser `invitation-batches-browser.test.ts` — a new TC-INV case: stopped page → Resume dialog → note shown, open-batch prompt visible.
- Integration schema test — the widened check refuses `resume_reason` without `resumed_at`.

## Out of scope
- A CLI resume command; a "re-stop" or undo of a resume; a stop rule for batches after the first.
- Requiring two operators to confirm (Q1).
- Changing the stop message, the CLI `list` "D13" column, or how "published" is counted (D28).

## ❓ Open questions
- **Q1 — One operator or both founders?** Default: one operator resumes; the reason names the brief decision row in which both founders are recorded as deciders. Alternative: a two-step confirmation by a second operator (more state, a pending-resume record and its own edge cases).
- **Q2 — Does the stop re-arm for later batches?** Default: no; R13 and D13 name the first 20 only, and a new kill signal would be a new brief decision. If the founders want a per-batch check, that is a separate spec.
