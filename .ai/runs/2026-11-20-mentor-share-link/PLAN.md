# Execution plan — share-link page (E02-S02)

Source spec: .ai/specs/2026-10-21-mentor-share-link-page.md
Issue: #28 · Epic: #17
Branch: feat/mentor-share-link (stacked on feat/mentor-list, PR #52)
Engine: om-auto-create-pr-loop (forced by the brief, regardless of step count)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA (`self` until the next checkpoint resolves it). The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | One slot read at one instant in the public read; no-store on GET /api/mentors/[slug] | inline | done | 93646eb |
| 1 | 1.2 | MentorPageView section order and both display states asserted | inline | done | 868553e |
| 1 | 1.3 | Request-scoped loadPublicMentor | inline | done | 6889f7d |
| 1 | 1.4 | Metadata (noindex, title, description, Open Graph) and error.tsx | inline | done | e93e46e |
| 2 | 2.1 | Share-link integration test | inline | done | c5f04ea |
| 2 | 2.1-review-fix | Separate visitor session and beforeAll seeding (CI), metadata via selectors, emoji-safe description cut | inline | done | 64e0d30 |

## Goal

`/m/<slug>` is the composed public page: one read at one clock instant decides `offerReady`, every `meetsLeadTime` and what is shown; the R01 line always; prices and times only when offer-ready; `noindex` and share-preview metadata; an error state; one composed key-equality test.

## Scope / already in place

`/m/[slug]` (#23, true 404 via `src/proxy.ts`), prices and slots gated by `offerReady` (#24, #25), `TextSessionNotice`, the `cache()` loader inline in `page.tsx`. This run finishes what the spec owns on top.

## Non-goals

Booking (#29), list (#27), new routes/schema/env, Open Graph images, visit recording.

## Risks

- Request-time `generateMetadata` under `cacheComponents`: verified by `npm run build` with no database.
- Stacked PR: base `feat/mentor-list`; after #52 merges GitHub retargets to `main` once that branch is deleted.
