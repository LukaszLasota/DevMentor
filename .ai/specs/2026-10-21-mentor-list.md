# A mentee can browse mentors filtered by stack tag, ordered by most recent availability, with no scores

Status: approved
Issue: #27 (E02-S01) · Epic: #17 · Depends on: #23 (`.ai/specs/2026-10-21-mentor-page.md`: public DTO, projection rule, stack-tag vocabulary, readiness primitive, `@devmentor/ui/mentors`) and #25 (`.ai/specs/2026-10-21-availability-slots.md`: `Slot`, `last_published_availability_at`, `meetsLeadTime`, `hasBookableSlot`); reads #24's price requirements and `prices` (`.ai/specs/2026-10-21-mentor-prices.md`) when merged · Source: `.ai/specs/product-brief.md` (R08, N02, D08, R04) · Builds on: `.ai/specs/2026-10-21-platform-primitives.md`, `.ai/specs/2026-10-21-sign-in-github-and-email.md` · Follows the course reference specs `2026-09-04-platform-primitives.md` (B18 list query, F1 surfaces), `2026-09-08-platform-primitives-ii.md` (B26 ordering key, A11 vocabulary, F11) and `2026-09-08-mentors-become-bookable.md`, adapted to this repository; the course has no story spec for its list (#20)

## 📝 TLDR
A thin story spec. Everything a mentor shows (fields, projection rule, vocabulary, readiness, prices, slots, ordering key) is designed in #23–#25 and referenced, not restated; this spec owns only the public list: `/mentors` and `GET /api/mentors?tag=<key>`. The list shows **only mentors for whom `mentorOfferReady` (#24, built on #23's readiness primitive, with #25's `hasBookableSlot`) is fully met**, optionally filtered by one of the four stack tags, ordered by `last_published_availability_at` descending. Each row is a card that links to the mentor's share page `/m/<slug>`. No search box, no rating, score, review, ranking or position numbers (N02, R08), asserted as absent. No cap, no pagination. `noindex`. No schema change.

## 📝 Problem Statement
R08 / D08 make the stack-tag list one of the two ways a mentee finds a mentor (the other is #23's share link), ordered by most recently published availability, with no search and no ranking; N02 forbids scores. #25 already writes the ordering key and #23/#24/#25 together define who is bookable, but nothing lists mentors: a mentee without a share link has no way in, and the sign-in spec still lands mentees on `/` "until the mentee home exists (#27)". The risk this spec guards against is a second, drifting notion of "listable": a list that shows a mentor the booking (#29) would refuse, or orders by a key that is also used as eligibility (course B26: a mentor with no remaining slot would sit at the top).

## 📝 Proposed Solution
A read-only `MentorListService.listBookable({ tag? })`: a SQL query narrows candidates by conditions `mentorOfferReady` implies (published, owner holds `mentor`, tag), one grouped slot query through `SlotService` loads each candidate's bookable-slot summary, and `mentorOfferReady` is then evaluated per candidate as the final authority. Results are ordered by the ordering key, projected to an allowlisted list item, and rendered by a public Tailwind page whose static shell is the heading and order line; the tag filter and list stream at request time.

**In scope:** `MentorListService`; `mentorListQuerySchema`; `GET /api/mentors`; `SlotService.bookableSummaryFor` (additive); the `MentorListItem` projection; `/mentors` (tag links, cards, empty and unknown-tag states, `noindex`); `MentorCard` in `@devmentor/ui/mentors`; #23's publish copy mentioning the list (Q2, additive); `homeFor` sending signed-in users without `operator`/`mentor` to `/mentors`; a "Find a mentor" link on `/`; integration fixtures for bookable mentors.
**Out of scope:** search, sorting choices, multi-tag filters, a cap or pagination (Q3; R08 reopens search at 30+ published mentors); any rating, review, ranking, session count or "top mentor" signal (N02); booking actions (#29); a copy-link button on cards (Q5); the share page itself and its composed view (#23, #28), including its `noindex` and "Not bookable yet" state (Q1, Q4); recording page or list visits (Q10, not filed); a per-mentor opt-out from the list (D04 superseded by D08: every bookable mentor is listed; a mentor leaves by unpublishing); any schema change or index.

Alternatives considered:
- **List every published mentor, show "Not bookable yet" on some** — rejected: issue AC4 and course B26 ("not an eligibility test") exclude mentors without slots; a list of unbookable people wastes the mentee's one visit.
- **A boolean `is_listed` column or a materialized flag** — rejected: a second encoding of readiness that drifts (#23 Q7: one definition); the lead time is evaluated at read time against the clock, so it cannot be stored.
- **Eligibility purely in SQL** — rejected: it re-encodes price bounds (env, #24) and the readiness keys in a query; the SQL may only narrow, `mentorOfferReady` decides (see Architecture).
- **Reuse the full public DTO per row** — rejected: it carries up to 200 slots per mentor; the list item is an allowlisted subset of the same fields plus one derived field.
- **Order by next available slot** — rejected: R08 fixes "most recent published availability" (`last_published_availability_at`); the next slot is shown, not used for order.
- **`DataTable`** — not used: the engineering standards' "every list uses `DataTable`" targets shadcn app/admin surfaces; `/mentors` is a public Tailwind page (F1, #23's `/m/[slug]` precedent).

## 📝 Architecture
- `packages/core/src/validators/mentors/mentor-list-query.schema.ts` (client-safe, `@devmentor/core/validators`) — `{ tag?: StackTagKey }` built from #23's `StackTags` vocabulary (course A11); one value only; unknown or repeated `tag` fails.
- `packages/core/src/services/availability/slot.service.ts` (#25, additive) — `bookableSummaryFor(mentorProfileIds, now) → Map<id, { count, nextStartsAt }>`: **one** grouped query (`GROUP BY mentor_profile_id`, `count(*)`, `min(starts_at)`, `HAVING count(*) > 0`) over non-removed slots with `starts_at >= now + BOOKING_LEAD_TIME` (same constant and inclusive boundary as `meetsLeadTime`); empty id list → empty map, no query. `countBookable` keeps its contract and delegates to it, so `hasBookableSlot` and the list share one slot rule.
- `packages/core/src/services/mentors/mentor-list.service.ts` — `MentorListService` (scoped, `{ em, clock, slotService, platformSettings }`), registered in `container.ts` + `cradle.ts`. `listBookable({ tag? })`:
  1. one `now = clock.now()` for the whole request;
  2. **candidate query** (parameterized, no interpolation): `published_at IS NOT NULL`, owner's roles contain `mentor`, `stack_tags @> ARRAY[tag]` when a tag is given; ordered `last_published_availability_at DESC, id ASC`; no `LIMIT` (Q3) and no slot `EXISTS` (the slot summary decides);
  3. `slotService.bookableSummaryFor(ids, now)`;
  4. `mentorOfferReady.evaluate(subject)` per candidate (contract: listed iff every returned requirement is `met`), with the same subject builder `/m/[slug]` and #29 use; keep only fully met candidates, preserving query order;
  5. project with `toListItemDto`.
  Rule, held by a test: the candidate query uses only conditions that are **necessary** for `mentorOfferReady` (it may narrow, never widen or decide); a fixture per unmet requirement proves the definition, not the query, excludes it. Every listed mentor has a bookable slot, so `last_published_availability_at` is non-null for them (#25 writes it on publish); fixtures assert it rather than the query handling `NULLS LAST`.
- `packages/core/src/services/mentors/mentor-profile.service.ts` (#23) — its public projection pieces (`toPublicDto` keys, avatar join, role check) are reused by `toListItemDto` from one shared key list; no second avatar or role rule. `toListItemDto` truncates `bio` server-side to 280 characters on a word boundary with an ellipsis (the full bio stays on `/m/<slug>`).
- `packages/app/src/app/api/mentors/route.ts` — `GET`, public, `apiHandler` with `parseSearchParams(mentorListQuerySchema)`, `headers: { 'Cache-Control': 'no-store' }` (#23's option; lead time is per request). Sibling of #23's `api/mentors/me` and `api/mentors/[slug]`; no route collision. No `export const dynamic`.
- `packages/app/src/app/(marketing)/mentors/page.tsx` — public, Tailwind (F1), `metadata.robots = { index: false, follow: false }` (Q1). Static shell: heading and the order line only. A `<Suspense fallback={<MentorListSkeleton />}>` child awaits `searchParams`, renders the tag filter (its `aria-current` depends on the request), parses with the same schema, calls `listBookable` through `withScope`, formats prices with `formatMoney` (#24) and passes plain props to the cards. No `use cache`, no `instant = false` (an unknown tag is a rendered state, not a 404), no `loading.tsx`; the build never touches the database.
- `packages/ui/src/components/mentors/MentorCard.tsx` + `MentorTagFilter.tsx` + `MentorListSkeleton.tsx` — Tailwind only, exported through #23's `@devmentor/ui/mentors` entry (its ESLint rule keeps the admin barrel out of `(marketing)`). Props mirror `MentorListItem` (in `ui` types, kept in sync like `MentorPublicView`) plus preformatted price strings; `ui` imports neither `core` nor `next`. Avatar, initial fallback and public-work link text reuse `MentorPageView`'s helpers (extracted to one module in `components/mentors/` when the second consumer appears, i.e. here). Next slot via #22's `LocalTime` (`ui/src/time/LocalTime.tsx`), re-exported through `@devmentor/ui/mentors` so `(marketing)` pages never import the admin barrel; #23/#25's public slot rendering uses the same re-export.
- `packages/app/src/lib/session.ts` (sign-in spec) — `homeFor(roles)` fallback changes from `/` to `/mentors` (the mentee home the sign-in spec deferred to #27); `operator → /admin`, `mentor → /mentor` unchanged.
- `packages/app/src/app/(marketing)/page.tsx` — gains a "Find a mentor" link to `/mentors`.
- `/mentor/profile` (#23) — publish copy, additive (Q2): see UI/UX.

## 📝 Data Model
No change. Reads `mentor_profiles` (#23: `published_at`, `slug`, `display_name`, `public_work_url`, `bio`, `stack_tags`; #24: `price_25_cents`, `price_50_cents`; #25: `last_published_availability_at`), `slots` (#25, served by `slots_mentor_starts_at_active_uq`) and `users` (`roles`, `avatar_url`). No index added: 1.0 supply is ≤ 50 mentors (Q3); an index or a GIN on `stack_tags` arrives with search in 1.1 if needed.

## 📝 API Contracts
| Route | Auth | Input | Answer |
|---|---|---|---|
| `GET /api/mentors` | public | `?tag=typescript\|react\|python\|ai-agents` (optional, single) | `{ items: MentorListItem[] }` in list order, all matches (no cap); invalid `tag` (unknown, empty, wrong case, repeated) → 400 `VALIDATION_ERROR` with `fieldErrors.tag` (the page instead renders the unknown-tag state with 200); database down → 503 through `apiHandler`. `Cache-Control: no-store` |

- `MentorListItem` (explicit allowlist, `expectProjectionKeys` key-equality test): `{ slug, displayName, avatarUrl, publicWorkUrl, bio, stackTags, prices, nextBookableSlotAt }` — the first six are #23's public DTO fields with identical types (`bio` truncated, see Architecture); `prices` is #24's `{ price25Cents, price50Cents, currency }` (never null in the list, since readiness requires both); `nextBookableSlotAt` is the ISO instant of the earliest slot meeting the lead time. Never: email, GitHub login, ids, `publishedAt`, `lastPublishedAvailabilityAt`, `initialPublishDueAt`, readiness details, bounds, slot lists or counts. If #24 has not merged when this ships, `prices` is absent and #24 adds it additively (as #25 did for #23).
- Order is part of the contract: `last_published_availability_at DESC`, ties by `id ASC` (stable, arbitrary, not a ranking); the key itself is not exposed.
- No envelope, error-code or vocabulary change; the route and the `bookableSummaryFor` method are additive (`BACKWARD_COMPATIBILITY.md`). The `homeFor` change touches no protected surface (page behaviour), noted in the PR body.

## 📝 UI/UX
- **`/mentors`** (public, Tailwind, `noindex`): heading "Find a mentor"; line "Mentors who most recently published open times come first."; tag filter as a `nav` (`aria-label="Filter by stack tag"`) of links: All, TypeScript, React, Python, AI agents (`?tag=<key>`, `aria-current="page"` on the active one; labels from the vocabulary). No text input, no sort control.
- Results are a `<ul>` (not `<ol>`, no position numbers). Each card: avatar (plain `<img>`, `referrerPolicy="no-referrer"`, initial fallback, as #23), display name as the link to `/m/<slug>`, tag labels, public-work link (`rel="noopener nofollow ugc"`, host + path text, as #23), bio (server-truncated) clamped to three lines as plain text, "25 min · $40.00 · 50 min · $75.00", "Next open time: <LocalTime>". No copy-link button (Q5).
- Empty states: no tag → "No mentors have open times right now. Check back soon."; with a tag → "No <Tag> mentors have open times right now." with a link to All. Invalid tag → "Unknown stack tag." with the filter links, no list (status per API Contracts).
- While streaming: `MentorListSkeleton` (filter and card placeholders, `aria-busy`).
- **#23's publish copy** (Q2, additive): the `/mentor/profile` line becomes "Publishing shows your name, GitHub avatar (if any), link, description and tags to anyone with the link, and lists you on /mentors while you have open times."; component test asserts the text.
- **No rating, score, review, star, ranking, "top", session count or search box** in the markup, asserted as absent (`expectAbsent`).
- The card shows what `/m/<slug>` shows; the list never promises a booking ("open times", not "available now" or "guaranteed"); #29 rechecks at booking.

## 📝 Edge Cases & Failure Scenarios
- Invited mentor with an empty profile, a draft page, an unpublished page, no slots, only removed slots, only past slots, or only slots within two hours → not listed (issue AC4; Q5 of #25).
- Published mentor without prices, with a price outside current bounds (bounds tightened, #24 Q4), or platform price settings unset → not listed (`settings` unmet fails closed: the list is empty, no error).
- Owner lost `mentor` (by-hand `revokeRole`) → not listed, as #23's public read 404s.
- Mentor's only bookable slot crosses the two-hour line between two requests → listed on the first, absent on the second (clock per request, no cache).
- Mentor removes all slots → disappears; the ordering key stays (never lowered, #25), so republishing later puts them first again.
- Two mentors with the same `last_published_availability_at` → stable order by `id`.
- `?tag=REACT`, `?tag=`, `?tag=rust`, `?tag=react&tag=python` → invalid tag (API Contracts).
- Mentor tagged `['react','python']` → listed under React, Python and All.
- Clock skew across instances → ordering key is monotonic via #25's `GREATEST`; lead time uses each request's injected clock.
- Database unreachable → `npm run build` passes; the API answers 503; the page's Suspense child hits the error boundary while the shell renders.

## ✅ Acceptance criteria
- Given bookable mentors tagged React and Python, when a visitor opens `/mentors` and picks React, then only mentors tagged React appear; with All, both appear. (issue AC1, R08)
- Given bookable mentors whose last slot publications are T1 < T2 < T3, then the list shows them T3, T2, T1, and removing a slot does not change that order. (issue AC2, R08)
- Given the list page and API payload, then no rating, score, review, ranking, position number or search box appears. (issue AC3, N02, negative)
- Given an invited mentor with no published page, or with a published page and no future slot meeting the two-hour lead, then they do not appear. (issue AC4, negative)
- Given a published mentor with slots but without both valid prices, or with price settings unset, then they do not appear. (shared readiness, negative)
- Given a mentor whose `mentor` role was revoked, then they do not appear. (fail closed)
- Given an unknown or repeated tag, then the API answers 400 `VALIDATION_ERROR` naming `tag`, and the page shows the unknown-tag state with no mentors and HTTP 200.
- Given `/mentors`, then it carries `noindex`. (Q1)
- Given `/mentor/profile` before publish, then the publish line mentions the list on /mentors. (Q2)
- Given the API payload, then each item's keys equal exactly the `MentorListItem` allowlist. (projection)
- Given a card, when the visitor follows its name, then `/m/<slug>` opens for that mentor. (R08 share page)
- Given a signed-in user holding only `mentee`, when they sign in without `returnTo`, then they land on `/mentors`.
- Given every candidate state from #23–#25, then the list includes a mentor if and only if `mentorOfferReady.evaluate` reports every requirement met at that request's clock. (one definition)

## 📝 Risks & Impact Review
`risk-medium`: a new public read and page, no schema change, no write path. Main risks: (1) drift between the candidate query and the readiness definition — the query only narrows, the definition decides, with the iff test above; (2) a public projection leak — allowlist plus key-equality test, no new fields beyond #23/#24's public ones plus one derived instant; (3) every published, bookable mentor is enumerable — by design (slugs are public, #23), and the mentor-interview objection "not on a list next to strangers" is a known, accepted gap (brief, D08 superseding D04). Performance is bounded by 1.0 supply (≤ 50, no cap by Q3), with two queries per request. Compatibility: additive route, service, service method, `ui` components and fixtures; `homeFor` fallback changes from `/` to `/mentors` as the sign-in spec anticipated.

## 📝 Decisions in play
R08 / D08 (list by stack tag or share link, ordered by most recent published availability, no search or ranking; D08 supersedes D04's opt-in — founder A), N02 / R04 (no scores; public work and a plain description instead — founder A), D24 (the four beachhead tags), R09 / D09 (the two-hour lead, via #25), R12 (prices within bounds, via #24), Q10 (visit recording, not filed — founders A and B).

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
- **Q1** `/mentors` and `/m/[slug]` are `noindex` in 1.0 (this spec sets it on `/mentors`; `/m/[slug]` belongs to #23/#28).
- **Q2** #23's publish copy says the page is visible by link and on `/mentors` while the mentor has open times — additive copy change with a test, shipped here.
- **Q3** No cap and no pagination (supply ≤ 50; R08 reopens search at 30+ published mentors).
- **Q4** A mentor who is not offer-ready shows only "Not bookable yet" on `/m/[slug]`: no prices, no slots (#23/#28); such a mentor is never listed.
- **Q5** No copy-link button on list cards.
- Canonical gate name: `mentorOfferReady` (#24) composed from #23's readiness primitive; #25's requirement is `hasBookableSlot`.

## ✅ Resolved (from the course)
Adopted from the course reference specs on 2026-10-21:
- Eligibility and ordering are separate (B26): order by `last_published_availability_at`, eligibility by the bookability definition, never the key.
- The list shows only offer-ready mentors with at least one future, non-removed slot (B26 "#20's list must additionally require…"), which here is `mentorOfferReady` (Q7 of #23–#25).
- An unknown `?tag=` is an error, not an empty list (B18); the tag enum comes from the one vocabulary (A11).
- No pagination (B18: no issue asks for it); `/mentors` is a public Tailwind surface (F1).
- Ratings asserted absent, not merely omitted (`expectAbsent`).

Deliberate differences from the course:
- (a) Unknown tag is 400 `VALIDATION_ERROR` (our code), not 422.
- (b) No `orderBy` parameter or whitelist (B18): R08 allows exactly one order, so none is accepted.
- (c) No per-row copy-link button (Q5), so F11's promotion of `CopyShareLink` to `ui/src/backend/actions/` is not triggered; rows link to `/m/<slug>` (the share link itself).
- (d) No `export const dynamic`; the request-time list lives inside `<Suspense>` under `cacheComponents`.
- (e) Integration fixtures (`seedBookableMentor`, built through the services) arrive here, the first story needing several bookable mentors; #25 deferred them to #29, which now reuses them.

Choices made in this spec (no product owner input needed, flag in review if wrong):
- No tag selected shows every bookable mentor ("all mentors filtered by stack tag", brief Key flows); one tag at a time.
- The card shows the next open time; it informs but never orders.
- Signed-in mentees' home becomes `/mentors`.

## 📝 Review notes
- All review findings of 2026-10-21 applied: cap removed (Q3), one grouped slot query with `countBookable` delegating and no candidate `EXISTS`, tag filter inside the Suspense child with an explicit skeleton, `LocalTime` re-exported via `@devmentor/ui/mentors`, server-side bio truncation in the allowlist test, gate pinned to `mentorOfferReady.evaluate`, 400-vs-200 stated once, multi-tag test, non-null ordering key asserted in fixtures, `homeFor([])` test, `nextBookableSlotAt` in the allowlist test, Q2 publish copy.
- Naming drift in sibling specs (`mentorBookable`, `pagePublished`, `futureBookableSlot`) was fixed in the 2026-10-21 consistency pass; #23–#25 now use the canonical names above.
- #28 composes the share page from #23–#25; this spec does not touch `/m/[slug]` beyond being its entry point.

## ❓ Open Questions
None. Q10 (does 1.0 record visits to mentor pages or the list for the 2026-11-28 interviews?) stays with founders A and B; if answered yes, it is a separate story.

## 📋 Phasing
One phase, one PR, after #23 and #25 have merged (readiness primitive, public projection, slots, ordering key). #24 is not a hard dependency: if it has not merged, its price requirements are absent from the definition and the card omits prices; #24 adds both. Ships with Epic 02 before #29, which depends on it.

## 📋 Implementation Plan
1. `mentorListQuerySchema` in `@devmentor/core/validators`; tests: each key, absent, empty, wrong case, unknown, repeated.
2. `SlotService.bookableSummaryFor` (one grouped query) and `countBookable` delegating to it; tests with a fixed clock: inclusive two-hour boundary, removed and past slots excluded, earliest start, empty id list (no query), several mentors in one query, mentors with zero slots absent from the map; existing `countBookable` tests still green.
3. `toListItemDto` from the shared public key list; `expectProjectionKeys` test including `nextBookableSlotAt` and `prices`; bio truncation (≤ 280, word boundary, ellipsis, short bio untouched); null avatar.
4. `MentorListService` + container/cradle; tests: tag filter incl. a multi-tag `stack_tags` mentor, order with ties, fixtures assert non-null `last_published_availability_at`, one fixture per unmet requirement (draft, unpublished, no slots, only removed/past/within-two-hours slots, no prices, out-of-bounds price, settings unset, role revoked) excluded by the definition, the iff property over all fixtures (`mentorOfferReady.evaluate` all met), no cap, single `now` per call.
5. `GET /api/mentors`; route tests: 200 envelope and order, 400 `fieldErrors.tag`, `no-store`, 503 when the database fails, no CSRF needed on GET.
6. `ui`: `MentorCard`, `MentorTagFilter`, `MentorListSkeleton`, shared avatar/link helpers extracted from `MentorPageView`; exported via `@devmentor/ui/mentors` with the `LocalTime` re-export; component tests: initial fallback, link text truncation, bio as text, prices line, `LocalTime`, `aria-current`, `<ul>` with no numbering, no copy-link button, `expectAbsent` for rating/score/review/ranking/search.
7. `/mentors` page (static shell + `<Suspense>` filter and list with skeleton fallback, empty, filtered-empty and unknown-tag states, `noindex` metadata), "Find a mentor" link on `/`, `homeFor` fallback `/mentors` (tests incl. `homeFor([])`), #23 publish copy (Q2) with its test; `npm run build` with no database.
8. Integration fixtures `seedBookableMentor` (and variants without slots / prices / page) under `packages/app/integration/fixtures/`, built through the services; integration test: three bookable mentors with distinct tags and publication times plus one with no slots and one with a draft page → signed-out visitor opens `/mentors` and sees exactly the three in order → picks React and sees only React mentors → follows a card to `/m/<slug>` → no rating/score/search present; a mentee signing in lands on `/mentors`. `npm run test:integration`.
Each step ends with `npm run validate` green at 100% coverage.
