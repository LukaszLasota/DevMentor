# TC-INV-003 — A full batch offers the next batch; a decided batch 1 with 4 publishers stops invitations

- Test: [`packages/app/integration/invitation-batches-browser.test.ts`](../../../../packages/app/integration/invitation-batches-browser.test.ts)
- Spec: `.ai/specs/implemented/2026-11-24-invitation-batches.md` § Rules 2 and 5, § UI/UX (top of page), AC2, AC3; R13, D13
- Category: invitations · Priority: High · Type: UI + DB (seeded with SQL)

## Given–When–Then
- **Given** batch 1 holds 20 invitations and is closed (seeded with SQL), nothing decided.
- **When** the operator opens `/admin/invitations`.
- **Then** there is no invite form; the page says "This batch is full. Open a new batch to invite more." and offers "Open batch 2".
- **Given** batch 1 is decided with 4 publishers (4 accepted with a slot inside the window, 16 expired).
- **When** the operator opens `/admin/invitations`.
- **Then** the stopped banner shows word for word, with no form and no open button; batch 1 is labelled "Stopped" with "20 of 20 sent, 4 accepted, 4 published within two weeks".

## Levels checked
UI (top-of-page states, section line), database (seeded state).

## Edge cases not in this test
- The API and CLI refusals while stopped (`create`, `open`, `resend`) — `invitation-batches.test.ts` and unit tests.
