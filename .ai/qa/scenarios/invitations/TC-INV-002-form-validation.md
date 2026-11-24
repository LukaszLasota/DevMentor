# TC-INV-002 — The invite form refuses an invalid email and missing tags without a request

- Test: [`packages/app/integration/invitation-batches-browser.test.ts`](../../../../packages/app/integration/invitation-batches-browser.test.ts)
- Spec: `.ai/specs/implemented/2026-11-24-invitation-batches.md` § UI/UX (Invite form)
- Category: invitations · Priority: Medium · Type: UI + DB

## Given–When–Then
- **Given** batch 1 is open and the operator is on `/admin/invitations`.
- **When** the operator types "anna" as Email, ticks TypeScript and presses "Send invitation".
- **Then** "Enter a valid email address, e.g. name@example.com." shows under Email and no invitation is created.
- **When** the operator types a valid address, ticks no tag and presses "Send invitation".
- **Then** "Pick at least one stack tag." shows under the tags and no invitation is created.

## Levels checked
UI (field errors), database (no row).

## Edge cases not in this test
- "anna@", "anna@example", spaces only and 255 characters — the shared schema test (`invitation-create.schema.test.ts`) and the manual check.
- `ALREADY_INVITED` / `EMAIL_IS_MENTOR` under Email — board unit tests.
