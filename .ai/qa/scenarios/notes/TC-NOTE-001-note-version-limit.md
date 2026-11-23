# TC-NOTE-001 — A session note stops at its version limit

- Test: [`packages/app/integration/session-note-version-limit.test.ts`](../../../../packages/app/integration/session-note-version-limit.test.ts)
- Spec: `.ai/specs/implemented/2026-11-20-session-note.md` (at most ten versions per note)
- Category: notes · Priority: Medium · Type: API + DB + UI (boundary)

## Given–When–Then
- **Given** a paid session that has ended, and ten note versions the mentor sent and the mentee declined, each with a comment.
- **When** the mentor sends an eleventh version.
- **Then** the API answers 409 `NOTE_LIMIT`; the database still holds exactly ten versions (highest = 10).
- **And** the mentor's session page says "This note reached its version limit. Write to the DevMentor team by email." and shows no note form.

## Levels checked
API (409 + code), database (version count), UI (limit message, no form).

## Edge cases not in this test
- One waiting version at a time, decline needs a comment (`session-note.test.ts`).
- Approving ends the note: no further versions (unit-tested in `session-note.service`).
