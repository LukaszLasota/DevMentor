# A mentee opening a share link sees the mentor's public work, prices and open slots

Status: approved
Issue: #28 (E02-S02) · Epic: #17 · Depends on: #23 (`.ai/specs/2026-10-21-mentor-page.md`: `/m/[slug]`, public DTO, readiness primitive, `MentorPageView`, `apiHandler` `headers` option), #25 (`.ai/specs/2026-10-21-availability-slots.md`: `slots`, `meetsLeadTime`, `hasBookableSlot`); #24 (`.ai/specs/2026-10-21-mentor-prices.md`: `prices`, `offerReady`, `formatMoney`, "Not bookable yet") when merged · Source: `.ai/specs/product-brief.md` (R08, R04, R01, N02, D08) · Sibling: #27 (mentor list, links to this page) · Course: no story spec for this; the course folds the share page into its mentor-page story (`2026-09-08-mentors-become-bookable.md` Slice 2–4, `2026-09-08-platform-primitives-ii.md` B24/F8), adopted below

## 📝 TLDR
**Thin spec.** `/m/[slug]` (#23) already exists, with the page fields (#23), prices and "Not bookable yet" (#24) and future slots with the two-hour state (#25) each added by its own story. This spec owns only what no single story asserts: the **composed public view** — one request-time read with one clock instant, the section order and the two display states (offer-ready / not bookable yet), the R01 "sessions are text" statement, `noindex` and share-preview metadata, an error state, one composed key-equality test on the public DTO, and one end-to-end integration test. No new table, route, env variable, readiness requirement or booking action.

## 📝 Problem Statement
R08/D08 make the share link one of the only two ways a mentee finds a mentor in 1.0; mentors bring their own audience through it. A visitor arriving from a mentor's post must, on one page and without signing in, see who the mentor is and what they have done (R04, no scores — N02), what a session costs, when they can book, and that the session is text (R01). Three approved specs each add a slice of that page, but none owns the whole: the order of sections, how readiness controls what is shown, the text-session statement, and an assertion that the composed payload leaks nothing. Issue criterion 2 (unknown or removed mentor → not found) is already #23's contract and is only re-asserted here.

## 📝 Proposed Solution
Keep `/m/[slug]` and `MentorPageView` from #23 and finish them: one cached-per-request loader feeds both `generateMetadata` and the page, so the 404 decision, `offerReady` (the `mentorOfferReady` gate) and every slot's `meetsLeadTime` come from one `getPublicBySlug` call at one `clock.now()`, and `hasBookableSlot` is computed from the same slot rows the page lists. `MentorPageView` gets a fixed section order and a "Sessions" section: always the R01 statement, then prices and times when offer-ready, otherwise only "Not bookable yet".

**In scope:** section order and display states of `MentorPageView`; the R01 statement; `generateMetadata` (`noindex`, title, description, optional Open Graph) for `/m/[slug]`; `Cache-Control: no-store` on `GET /api/mentors/[slug]`; `error.tsx` for the segment; the request-scoped loader; the single-read/single-instant change in `getPublicBySlug`; the composed key-equality test; the `seedOfferReadyMentor` integration fixture; the integration test for issue criteria 1–3.
**Out of scope:** the page fields, slug, publish/unpublish and 404 rules (#23); price storage, bounds, formatting and `offerReady` semantics (#24); slot storage, lead-time rule and `hasBookableSlot` (#25); the list, its eligibility, its `noindex` and the publish-copy change (#27, see Resolved); any booking action, viable lengths or sign-in prompt (#29); recording visits (Q10, not filed); Open Graph images; any rating, review, score or ranking (N02).

Alternatives considered:
- **No spec, close #28 as covered by #23–#25.** Rejected: issue criteria 1 and 3 (all parts together; "sessions are text") are asserted by none of them, and the composed allowlist would be tested three times partially, never once fully.
- **A separate share page (e.g. `/s/<slug>`).** Rejected: #23 fixed `/m/<slug>` as the share link and the brief's glossary makes the share link "the link to a mentor's page".
- **Two reads (page fields before Suspense, availability inside it), or a separate `countBookable` query.** Rejected: two `clock.now()` values or two slot reads can disagree at the two-hour boundary (an enabled slot next to "Not bookable yet"); one read is also one query.
- **Show prices and times to a mentor who is not offer-ready.** Rejected (Q4): an amount that cannot be charged or a time that cannot be booked misleads the visitor.
- **Show which readiness item is missing to visitors.** Rejected: readiness reasons are owner data; visitors get only `offerReady` (#24).

## 📝 Architecture
- `packages/app/src/app/(marketing)/m/[slug]/load-public-mentor.ts` (new, colocated, one consumer) — `loadPublicMentor(slug)` wrapped in React `cache()` (request-scoped memoisation, **not** `use cache`): `withScope((c) => c.mentorProfileService.getPublicBySlug(slug))`, mapping `NotFoundError` to `null`. Called by `generateMetadata` and the page; one database read per request.
- `packages/app/src/app/(marketing)/m/[slug]/page.tsx` (#23, changed) — keeps #23's contract (`await params`, `notFound()` before any `<Suspense>`, `instant = false`, no `dynamic`, no `generateStaticParams`, no `loading.tsx`). Renders `MentorPageView` with the loaded DTO. No `<Suspense>` around Sessions: the data is already loaded and `LocalTime` is a client component. This replaces #25's "slot read inside the `<Suspense>` child"; #25's intent (request time, never `use cache`, per-request clock) holds.
- `generateMetadata` (same file) — from `loadPublicMentor`: `robots: { index: false, follow: false }` always (Q1); found → `title` `"<displayName> · DevMentor"`, `description` = bio collapsed to one line and cut at 160 characters with an ellipsis, and optionally `openGraph` `{ title, description, type: 'profile', url: ${APP_URL}/m/<slug> }`; unknown → a generic title `"DevMentor"` and no mentor data. It never calls `notFound()`: only the page-level `notFound()` before Suspense gives a true 404 (#23 Q1). Request-time metadata under `cacheComponents` relies on the page's `instant = false` (`next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, "With Cache Components"), checked by `next build`.
- `packages/app/src/app/(marketing)/m/[slug]/error.tsx` (new, client) — "This mentor page cannot be shown right now. Try again in a minute." with a retry (`reset`); no error detail.
- `packages/app/src/app/api/mentors/[slug]/route.ts` (#23, changed) — passes `headers: { 'Cache-Control': 'no-store' }` through #23's `apiHandler` option (lead-time state is per request).
- `packages/ui/src/components/mentors/MentorPageView.tsx` (#23, changed; Tailwind only, props = the public shape) — section order and display states below; the R01 statement as a colocated `TextSessionNotice` in `components/mentors/` (promoted to `components/sessions/` when #31 adds a second consumer, placement rule 4). Instants through `LocalTime`.
- `packages/core/src/services/mentors/mentor-profile.service.ts` (#23) — no new method. `getPublicBySlug` takes `clock.now()` once, loads the slot rows once (#25's `listPublicFor`), derives each `meetsLeadTime` and the `hasBookableSlot` subject input from those rows (no separate `countBookable` query on this path; #25's 200-slot cap keeps the rows complete), and evaluates `mentorOfferReady` (#24, built on #23's readiness primitive) at that instant.
- `packages/app/integration/fixtures/` — `seedOfferReadyMentor({ prices, slots })` composing #23's `seedPublishedMentorProfile` with prices and slots written through `MentorProfileService.updatePrices` and `SlotService.publish` (services, not SQL); reused by #27 and #29.
Boundaries unchanged: `ui` never imports `core`/`next`; `(marketing)` imports only `@devmentor/ui/mentors` (#23's ESLint rule).

## 📝 Data Model
None. Reads `mentor_profiles` (#23, #24, #25 columns), `users.avatar_url` and `slots`.

## 📝 API Contracts
No new route. `GET /api/mentors/[slug]` and the page share one public DTO: #23's keys plus #24's `prices`, `offerReady` and #25's `slots`, with the shapes those specs define. This spec adds one composed key-equality test (`expectProjectionKeys`) on the full DTO and on the route response; a later story that adds a key updates it in the same PR. The projection itself is unchanged by Q4 (hiding is a view rule). Slot `id`s are intentionally public: #29 books by slot id, and #25's owner routes answer 404 for another mentor's id. Errors: unknown, unpublished or role-revoked → 404 `NOT_FOUND` (#23). Database down → the route answers 503 `SERVICE_UNAVAILABLE` through `apiHandler`; the page renders `error.tsx` with HTTP 500, Next's status for an error thrown before streaming (an error boundary cannot set it). The difference is deliberate.

## 📝 UI/UX
`/m/[slug]`, public, Tailwind, same for signed-out and signed-in visitors (the owner included — no edit link). Section order:
1. **Header** — #23.
2. **What I have done** and **Public work** — #23.
3. **Sessions** — always the R01 line "Sessions are text — no video call. 25 or 50 minutes." (deliberate addition, see Resolved). Then:
   - `offerReady` → both prices (#24 formatting), "Times are shown in your time zone", and the upcoming times (#25: ascending, via `LocalTime`, past-lead slots disabled with #25's reason).
   - not `offerReady` → only "Not bookable yet" (#24): no amounts, no times, no reason (Q4).
No booking button, link or form in any state until #29. No rating, score, review, star, ranking, "top", "popular" or search box anywhere — asserted absent (`expectAbsent`). Accessibility: one `h1` (display name), `h2` per section, the slot list is a `<ul>`, a disabled slot's reason is text; the status line is plain text (not `role="alert"`).

## 📝 Edge Cases & Failure Scenarios
- Unknown slug, unpublished page, owner lost `mentor` → HTTP 404 page and 404 API (#23); metadata is generic (no title leak) and `noindex`.
- Slot exactly two hours ahead at request time → enabled and counted in `offerReady`, both from the same rows and instant.
- Only slots within two hours → not offer-ready → "Not bookable yet", no times shown.
- Prices outside tightened bounds or `PLATFORM_*` settings unset → not offer-ready → "Not bookable yet", no amounts; page renders (fail closed, no exception).
- 200 future slots (#25 cap) → all listed; one read.
- Bio of 2000 characters → metadata description cut at 160; page shows all of it.
- Database unreachable → page `error.tsx` (500), API 503; `npm run build` with no database passes.
- JavaScript off → times stay in their UTC label (`LocalTime` first render); everything else is server-rendered.

## ✅ Acceptance criteria
- Given an offer-ready mentor's share link, when a signed-out visitor opens it, then one page shows the public-work link, the description, both prices and the upcoming slots. (issue AC1; R04, R08)
- Given a published mentor who is not offer-ready (no valid prices or no bookable slot), when a visitor opens the link, then the page shows "Not bookable yet" and no prices, no times and no booking action. (Q4)
- Given a link to an unknown, unpublished or role-revoked mentor, then the visitor gets the not-found page with HTTP status 404. (issue AC2; #23)
- Given any state of the page, then it states that sessions are text and 25 or 50 minutes. (issue AC3; R01, R02)
- Given the page, then no rating, score, review, ranking or search box appears. (N02, R08, negative)
- Given the public payload, then its keys equal exactly #23 + #24 + #25's keys, and `offerReady`, `hasBookableSlot` and each `meetsLeadTime` come from one slot read at one clock instant. (projection)
- Given `GET /api/mentors/[slug]`, then the response carries `Cache-Control: no-store`.
- Given any `/m/[slug]` response, then it is `noindex`; given a known mentor, then title and description come from the display name and bio; given an unknown slug, then the metadata carries no mentor data. (Q1)

## 📝 Risks & Impact Review
`risk-low`: no schema, route, env or contract change; one additive header on an existing route; markup is not a protected surface (`BACKWARD_COMPATIBILITY.md`). Main risk is the public projection growing silently in a later story — held by the key-equality test. Second risk is `cacheComponents` and request-time `generateMetadata`: verified by `next build` with no database; if it is rejected, the fallback is the documented dynamic-marker pattern, never `dynamic` or `use cache` around the read.

## 📝 Decisions in play
R08 / D08 (share link, no search or ranking — founder A), R04 / N02 (public work and description, no scores — founder A), R01 (sessions are text — founder A), R02 (25/50 minutes), R09 (two-hour state, via #25), D24 (tags, via #23).

## ✅ Resolved
Resolved with the session owner (grill-me, 2026-10-21):
- Q1 `/mentors` and `/m/[slug]` are `noindex` in 1.0 (this spec: `/m/[slug]`; #27: `/mentors`).
- Q2 #23's publish copy on `/mentor/profile` says the page is visible by link and on `/mentors` while the mentor has open times — additive copy change with a test, lands with #27 (which creates `/mentors`).
- Q3 No cap and no pagination on the list (supply ≤ 50; R08 reopens search at 30+ published mentors) — #27.
- Q4 A mentor who is not offer-ready shows only "Not bookable yet": no prices and no slots. Overrides #24's and #25's "slots may still show" on this page.
- Q5 No copy-link button on list cards — #27.
- Canonical gate name is `mentorOfferReady` (#24), composed from #23's readiness primitive (#23 drafts call it `mentorBookable`); #25's requirement is `hasBookableSlot`.

Adopted from the course reference specs: the share page is the mentor page; one public projection held by a key-equality test (B24) with no email, invitation, publish deadline or Stripe data; every instant through `LocalTime`; no score/review/rating/ranking, asserted negatively; offer-ready read from the one readiness definition.

Deliberate additions and differences from the course: no `force-dynamic` (Next 16 `cacheComponents`); the R01 line on the mentor page (the course puts it only on session screens) because issue #28 AC3 asks for it; Open Graph metadata is an optional addition (not in the issue), droppable without changing any criterion; not-ready mentors show no slots (Q4).

## 📝 Review notes
All review findings of 2026-10-21 applied (no-store header, one slot read for `hasBookableSlot`, no `notFound()` in metadata plus a build check, no Suspense around Sessions, references instead of restated DTO/states/copy, Q4 hiding, error status difference stated, public slot ids, shipping before #24, deliberate additions marked, `noindex`). None left unapplied.

## 📋 Phasing
One phase, one PR, after #23 and #25 are merged; ships with Epic 02 by 2026-10-31. If #24 is not merged yet, the PR ships without `prices` and the price rows, and adds `offerReady` from the gate as it stands (#23 + #25 requirements); #24's PR then adds `prices`, its requirements and the price rows, updating the key-equality test.

## 📋 Implementation Plan
1. `getPublicBySlug`: one slot read at one `clock.now()` feeding `slots`, `hasBookableSlot` and `mentorOfferReady`; single-instant test (fixed clock; slot at exactly now + 2 h enabled and counted; no second slot query); composed `expectProjectionKeys` test on the DTO and the route response; `no-store` on `GET /api/mentors/[slug]` asserted in the route test.
2. `TextSessionNotice` and `MentorPageView` section order + both display states; component tests: R01 line in both states, prices and times only when offer-ready, "Not bookable yet" alone otherwise, disabled-slot reason, absent booking action, `expectAbsent` for rating/score/review/ranking/search, heading structure.
3. `load-public-mentor.ts` (React `cache`, `NotFoundError` → `null`); tests: found, not found, other errors propagate, one service call for two invocations in a request.
4. `page.tsx` (no Suspense around Sessions), `generateMetadata` (`noindex`, title, 160-char description, optional Open Graph, generic for unknown, no `notFound()`), `error.tsx`; tests incl. unknown-slug metadata and the error retry. `npm run build` with no database (request-time metadata with `instant = false`).
5. `seedOfferReadyMentor` fixture; integration test `mentor-share-link`: signed-out visitor opens an offer-ready mentor's link → link, bio, tags, both prices, slots, R01 line, no rating/search, `noindex`; a published mentor without prices → only "Not bookable yet", no amounts, no times, no booking action; unpublish → HTTP 404; unknown slug → HTTP 404; `<title>` carries the display name. `npm run test:integration`.
Each step ends with `npm run validate` green at 100% coverage.
