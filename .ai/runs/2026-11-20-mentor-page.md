# Execution plan — mentor page (E01-S03)

Source doc: .ai/specs/2026-10-21-mentor-page.md
Issue: #23 · Epic: #16
Branch: feat/mentor-page

## Goal

An invited mentor saves a draft page (display name, public-work link, bio, 1–4 stack tags) on `/mentor/profile`, publishes it once all four are present, gets an immutable share link `${APP_URL}/m/<slug>`, and a signed-out visitor sees the page; unpublish gives a true HTTP 404 and keeps the slug.

## Scope

- `core/src/domain/` (vocabulary, slug, readiness) — new, client-safe.
- `db`: `mentor_profiles` widened + one migration (up/down), named unique slug constraint, three CHECKs.
- `core`: `mentorProfileUpdateSchema`, `services/mentors/readiness.ts`, `MentorProfileService` (getOwn/updateOwn/publish/unpublish/getPublicBySlug), event `mentors.profile.published`, `http/mentors.ts` handlers.
- `app`: `/api/mentors/me`, `/me/publish`, `/me/unpublish`, `/api/mentors/[slug]`; `/mentor/profile`; page step on `/mentor`; public `/m/[slug]`.
- `ui`: the E01 components already exist in Storybook (`MentorPageView`, `ReadinessChecklist`, `ProfileActions`, `CopyShareLink`, CrudForm `multiselect`, `@devmentor/ui/mentors`); only copy/prop adjustments and the `(marketing)` ESLint rule.

## Non-goals

Prices (#24), slots (#25), mentor list (#27), booking (#29), slug renaming, page-visit recording, any rating/score/review.

## Adaptation notes (code differs from the spec's assumptions)

- `apiHandler` `headers` option (spec step 4) already exists (merged with #22); no change needed beyond reuse.
- The UI components of spec step 9 were built with the design system (lesson 06, PR #37); this run reuses them and changes only what the spec requires (publish copy without the #27 `/mentors` clause).
- The stack-tag literal stays in `db` (`STACK_TAGS`, used by the entity type and the invitations CHECK); `core/src/domain/vocabularies/stack-tags.ts` is the source the app reads, and a drift test asserts both CHECK literals and the `db` constant equal its keys.
- `@devmentor/core/validators` may import `core/src/domain/**` (client-safe, pure): the spec's single vocabulary definition feeds the Zod enum. ESLint and `validators/index.test.ts` allow exactly that folder; `domain/` gets its own client-safe guard.
- Migration is hand-written (no DB reachable from the agent sandbox to run `migration:create`); the snapshot is updated to match, and integration tests apply it through `npm run db:migrate`.

## Risks

- `risk-high`: schema migration + new public route + public projection. Mitigation: key-equality test on DTOs, migration up/down integration test, true-404 check over HTTP.
- `/m/[slug]` true 404 under `cacheComponents` depends on `notFound()` before any Suspense and `instant = false` — verified by integration test over HTTP.
- Integration tests need Docker (owner approval, outside sandbox).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain primitives

- [ ] 1.1 Stack-tag vocabulary in core/domain and invite-cli switch
- [ ] 1.2 Slug helpers
- [ ] 1.3 Readiness primitive

### Phase 2: Data

- [ ] 2.1 MentorProfile entity widening, migration and drift test

### Phase 3: Core services and API

- [ ] 3.1 mentorProfileUpdateSchema
- [ ] 3.2 Mentor readiness definitions, MentorProfileService, event, container
- [ ] 3.3 Mentor HTTP handlers and API routes

### Phase 4: UI and pages

- [ ] 4.1 UI adjustments and marketing import rule
- [ ] 4.2 /mentor/profile, /mentor page step and public /m/[slug]

### Phase 5: Verification

- [ ] 5.1 Integration test mentor-page
- [ ] 5.2 Full validation gate
