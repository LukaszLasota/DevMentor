# Lesson 21 brief — invitation batches of 20 with the two-week publish check (R13, D13)

Adapted from the course prompt for issue #30 of the course reference project
(course material, kept outside this public repository). The course prompt names files,
decision ids and routes of the course repository; DevMentor's own ones win. Ground every path in this repo
before writing the spec, and record each difference as a deviation in the spec.

## Mapping to DevMentor

- Brief rules: R13 (invite-only batches of 20, one bookable session within two weeks), D13 (fewer than 5 of
  the first 20 publishing stops further invitations until the founders interview the decliners), A02.
  The course's D18/D19/D24/R16/R17/R18 map to these; quote DevMentor's ids.
- Existing code: `packages/db/src/entities/invitations/invitation.entity.ts` (free-text `batch` column,
  `publishDueAt` set on acceptance from `MENTOR_PUBLISH_WINDOW_DAYS`),
  `packages/core/src/services/invitations/invitation.service.ts`, `packages/core/src/cli/invite-cli.ts`
  (`npm run invite`), mailers in `packages/core/src/mail/`, operator role from `OPERATOR_EMAILS`,
  operator dashboard `packages/app/src/app/(admin)/admin/`, operator API routes under
  `packages/app/src/app/api/admin/`.
- The course's `/admin/users`, `lib/nav.ts`, `InvitationBatch.tsx`, `mailer.port.ts` and
  `tests/integration/` may not exist here: find DevMentor's equivalents (panel navigation, `packages/ui`
  concept folder, `packages/app/integration/`) or create them following `AGENTS.md`, and say so in the spec.
- Spec file: `.ai/specs/implemented/2026-11-24-invitation-batches.md`.

## Keep from the course prompt

The batch rules (numbering, at most 20, one open batch, explicit open action), the invitation statuses and
their exact words and boundaries, the counters, the D13 stop rule (batch 1 only, computed per request, no
resume action in this task), the single create path shared by the screen and `npm run invite -- create`,
email-before-save (a mailer failure saves nothing), the exact refusal messages, raw token only in the
email, operator-only page and routes with 401/403 and the three-check access-control rule from
`AGENTS.md`, the screen behaviour, the out-of-scope list, the edge cases (21st invitation, both races,
status boundaries, stop rule 4 vs 5) and the tests (unit with a fake clock, integration on a real DB with
the races and migration up/down/up, agent-browser scenarios), plus the manual check as `mock-operator`
and `mock-mentor` with screenshots.

## Delivery

Stage only (no commit, push or PR); the owner reviews the staged branch. Record time, models with the
date, and how many reviewer findings were real vs hallucinated, for the lesson's comparison.
