# TC-INV-004 — Mentors and mentees cannot reach invitations

- Test: [`packages/app/integration/invitation-batches-access.test.ts`](../../../../packages/app/integration/invitation-batches-access.test.ts) (checks 2 and 3)
- Spec: `.ai/specs/implemented/2026-11-24-invitation-batches.md` § API Contracts, AC5; `AGENTS.md` access-control three checks; threat model R16 (operator authority)
- Category: invitations · access control · Priority: High · Type: API + DB + UI

## Given–When–Then
- **Given** an operator with batch 1 open and one invitation, a signed-in mentee and a signed-in mentor (each reaches their own resource: `/api/auth/me`, `/api/mentors/me`).
- **When** the mentee and the mentor call `GET` and `POST /api/admin/invitation-batches` and `POST /api/admin/invitations` with a valid payload.
- **Then** each answers 403; signed out each answers 401; no invitation or batch is created.
- **And** `/admin/invitations` sends them home with `notice=operator_only`, and their sidebar has no "Invitations" link.
- **And** the operator's overview, re-read afterwards, is unchanged field by field.

## Levels checked
API (403/401 with valid payloads), database (no new rows), page redirect, sidebar.
