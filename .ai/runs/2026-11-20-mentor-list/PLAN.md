# Execution plan — mentor list (E02-S01)

Source spec: .ai/specs/2026-10-21-mentor-list.md
Issue: #27 · Epic: #17
Branch: feat/mentor-list
Engine: om-auto-create-pr-loop (forced by the brief, regardless of step count)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA (`self` until the next checkpoint resolves it). The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | mentorListQuerySchema | inline | todo | — |
| 1 | 1.2 | SlotService.bookableSummaryFor with countBookable delegating | inline | todo | — |
| 1 | 1.3 | MentorListItem projection with bio truncation | inline | todo | — |
| 1 | 1.4 | MentorListService and container registration | inline | todo | — |
| 1 | 1.5 | GET /api/mentors | inline | todo | — |
| 2 | 2.1 | Public /mentors list page with filter and states | inline | todo | — |
| 2 | 2.2 | Find a mentor link on / and the publish copy mentioning /mentors | inline | todo | — |
| 3 | 3.1 | Integration test for the mentor list | inline | todo | — |

## Goal

`/mentors` lists exactly the mentors for whom `mentorOfferReady` is fully met, filtered by one stack tag, ordered by `last_published_availability_at DESC, id ASC`, with no scores; `GET /api/mentors?tag=` serves the same list.

## Scope

Spec Architecture. Storybook already has `MentorCard`, `MentorTagFilter`, `MentorListSkeleton` and the `/mentors` screens (`MentorListPattern`) — reuse them. `homeFor` already falls back to `/mentors` (no change).

## Deviations decided at planning (recorded in the spec's implementation notes at the end)

- `/mentors` stays in the `(mentee)` group (the existing mentee home at the same URL) and becomes public: that layout has no guard and shows the account bar and sidebar only with a session, so signed-in mentees keep sign-out, the sidebar and `?notice=` (L03), and signed-out visitors get the list. A second route at `/mentors` in `(marketing)` is impossible (one URL, one page).
- `bookableSummaryFor` reads the bookable slots of all candidates in one `find` and groups them in the service (≤ 50 mentors × ≤ 200 slots in 1.0); core cannot import MikroORM's raw-SQL helpers, and the one-query rule holds.

## Non-goals

Search, sort choices, multi-tag filters, pagination; ratings; booking; copy-link on cards; `/m/[slug]` changes (#28); visit recording.

## Implementation Plan

### Phase 1: Core
#### Step 1.1 — mentorListQuerySchema
- `{ tag?: StackTagKey }`; unknown, empty, wrong-case or repeated tag fails; client-safe export.
#### Step 1.2 — SlotService.bookableSummaryFor with countBookable delegating
- `Map<id, { count, nextStartsAt }>`; empty ids → no query; inclusive two-hour boundary; `countBookable` delegates.
#### Step 1.3 — MentorListItem projection with bio truncation
- `toListItemDto` from the public key list + `prices` + `nextBookableSlotAt`; bio ≤ 280 on a word boundary with an ellipsis; key-equality test.
#### Step 1.4 — MentorListService and container registration
- Candidates: published, tag (`stack_tags @>`), ordered key desc/id asc, owner populated; one `now`; summary; `mentorOfferReady` decides (owner role checked too); iff test over every unmet-requirement fixture.
#### Step 1.5 — GET /api/mentors
- Public `apiHandler`, `parseSearchParams`, `no-store`; 400 `fieldErrors.tag`.

### Phase 2: UI
#### Step 2.1 — Public /mentors list page with filter and states
- Static heading + order line; Suspense child: filter, list (`MentorCard`, prices via `formatMoney`), empty / filtered-empty / unknown-tag (200); `noindex`; `RoleNotice` kept; no session required.
#### Step 2.2 — Find a mentor link on / and the publish copy mentioning /mentors
- Q2 copy in `ProfileActions` with its test.

### Phase 3: Integration
#### Step 3.1 — Integration test for the mentor list
- Three bookable mentors with distinct tags and publication order, one without slots, one draft → signed-out `/mentors` shows exactly the three in order → React filter → card to `/m/<slug>` → no ratings/search; API 400 for unknown tag; mentee sign-in lands on `/mentors`.

## Risks

- Drift between the candidate query and readiness: the query only narrows; iff test.
- Public projection leak: allowlist + key-equality test.
- Integration tests now see a public `/mentors`: existing tests that expected a guard there are updated.
