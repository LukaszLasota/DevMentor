# TC-INV-001 — An operator opens batch 1 and sends an invitation

- Test: [`packages/app/integration/invitation-batches-access.test.ts`](../../../../packages/app/integration/invitation-batches-access.test.ts) (check 1)
- Spec: `.ai/specs/2026-11-24-invitation-batches.md` § UI/UX, AC1, AC7; R13
- Category: invitations · Priority: High · Type: API + DB + mail log + UI

## Given–When–Then
- **Given** no invitation batch exists and the operator (`mock-operator`) is signed in.
- **When** the operator opens batch 1 and sends an invitation to ` IA-INVITED-<run>@DEVMENTOR.TEST ` with the tag TypeScript.
- **Then** the answer is 201 with the normalized email, batch 1 and `sent: 1`, and no token or link in the body.
- **And** the app log has the email ("You are invited to mentor on DevMentor") whose link opens `/invitation/<token>` for that address.
- **And** `/admin/invitations` shows "Batch 1", "1 of 20 sent, 0 accepted, 0 published within two weeks" and the row "Waiting for acceptance".

## Levels checked
API (overview, open, invite), mail (app log), page text, sidebar link.

## Edge cases not in this test
- The confirm dialog ("Open batch 1? It takes up to 20 invitations.") — unit-tested in the board; manual check before staging.
- Mail failure (503, nothing saved) — `invitation-batches.test.ts`.
