# A mentor can publish slots

Status: approved
Issue: #25 (E01-S05) · Epic: #16 · Depends on: #23 (`.ai/specs/2026-10-21-mentor-page.md`, merged first: public read, `/m/[slug]`, readiness primitive) and #22 (`.ai/specs/2026-10-21-mentor-invitations.md`: `LocalTime`, `/mentor`, `initial_publish_due_at`, `npm run invite -- list`) · Source: `.ai/specs/product-brief.md` (R09, R08, R13, D09, D13) · Builds on: `.ai/specs/2026-10-21-platform-primitives.md`, `.ai/specs/2026-10-21-sign-in-github-and-email.md` · Siblings: `.ai/specs/2026-10-21-mentor-prices.md` (#24) · Follows the course reference specs `2026-09-08-availability-slots.md`, `2026-09-08-mentors-become-bookable.md` (Slice 3) and `2026-09-08-platform-primitives-ii.md` (lesson 05), adapted to this repository

## 📝 TLDR
An invited mentor has nothing a mentee can book: nothing stores availability, and A02/D13 measure whether mentors publish within two weeks. Proposed: a mentor publishes individual start instants on `/mentor/slots`, sees them in a table in their own time zone, and removes them. Future slots appear on the mentor's page from #23 while the mentor is offer-ready, each shown available through exactly two hours before its start and disabled with the reason after that. The story adds `hasBookableSlot` to the single mentor readiness definition. It owns availability only; booking, occupancy, session lengths and booking-aware removal belong to #29 (E03).

## 📝 Problem Statement
R09/D09 say a slot can be booked only when it starts at least two hours after booking; R08 orders the mentor list by most recent published availability; R13/D13 ask each invited mentor for one bookable session within two weeks. Nothing in the repository represents a slot, and `AGENTS.md` names an `availability` concept that does not exist. #27 (list), #28 (share page) and #29 (booking) all read what this story writes.

A slot is a bare start instant, while #29 lets the mentee choose 25 or 50 minutes (R02) at booking time. Which lengths still fit, overlap prevention and double-booking therefore belong to #29, where real booking intervals exist. This story deliberately ships no partial occupancy logic that #29 would have to replace.

## 📝 Proposed Solution
Single published start instants, stored in UTC, soft-removed by the mentor, with a partial unique index so a removed time can be republished; the two-hour lead is evaluated against the injected server clock at read time, never stored. Publishing is bounded (active-slot cap, horizon) inside the publish transaction.

Alternatives considered:
- **Recurring weekly hours** (Cal.com-style schedules) — rejected for 1.0: the brief says only "mentors publish slots"; recurrence needs an expansion engine and a DST policy.
- **A `booking` relation on `Slot`** — rejected: one slot can see several payment attempts and cancellations; #29 adds an immutable `Booking.slotId` instead.
- **Hard delete on removal** — rejected: #29 must be able to explain a slot that vanished; `removed_at` keeps the row.
- **Buffers, per-mentor minimum notice, daily caps** — skipped: nothing in the brief asks for them; R09 fixes one global two-hour lead. Each is an additive column later.

**In scope:** `Slot` entity and migration; `SlotService` (`listMine`, `publish`, `remove`, `listPublicFor`, `countBookable`); `mentor_profiles.last_published_availability_at` (R08 ordering key for #27); the lead-time rule as a shared core helper; the `hasBookableSlot` readiness requirement; two owner routes; `CrudForm` `datetime` field type; `/mentor/slots`; future slots with lead-time state on #23's mentor page; a slots step on `/mentor`; the D13 column in `npm run invite -- list` promised by the invitations spec.
**Out of scope:** booking, occupancy, viable lengths, booked state and booking-aware removal (#29); cancellation (E03); booking notifications; recurring availability; calendar sync; integration-test seed fixtures (arrive with #29).

## 📝 Architecture
- `packages/db/src/entities/availability/slot.entity.ts` — registered in `entities/index.ts`; migration `availability-slots` (`up` and `down`) also adds `mentor_profiles.last_published_availability_at`; `MentorProfile` gains the property. `@devmentor/db` gains one additive public export `isUniqueViolation(err, constraintName)` (true only for SQLSTATE 23505 on the named constraint), so `core` never imports `@mikro-orm/*`.
- `packages/core/src/services/availability/lead-time.ts` — `BOOKING_LEAD_TIME_MINUTES = 120`, `meetsLeadTime(startsAt, now): boolean` (`startsAt >= now + 2h`, inclusive). Pure; #29 reuses it for its booking-time recheck. Named constants (not env, fixed product rules) beside it: `MAX_ACTIVE_FUTURE_SLOTS = 200`, `MAX_HORIZON_DAYS = 365`, `PAST_LIST_LIMIT = 50`.
- `packages/core/src/services/availability/slot.service.ts` — scoped, `{ em, clock, events }`; registered in `container.ts` + `cradle.ts`. Every owner method takes the caller's `userId`, resolves that user's `MentorProfile` and scopes every query by it; a mentor with no profile row → `NotFoundError` (fail closed, no implicit creation; same rule as #23 and #24). `publish`, in one transaction: lock the mentor's profile row (pessimistic write, so the cap holds under concurrency); reject `startsAt <= now` and `startsAt > now + 365 days` (`ValidationError` on `startsAt`); reject when active future slots ≥ 200 (`ConflictError`); insert; set `last_published_availability_at = GREATEST(COALESCE(last_published_availability_at, now), now)` (never moves backwards across instances). A unique violation on the named partial index becomes `ConflictError`; any other error propagates. Because a failed flush leaves the identity map unusable, the insert runs in `em.transactional` on its own fork and nothing reuses the request's `em` after a conflict. Emits `availability.slot.published` after commit. `countBookable(mentorProfileId, now)` = future, non-removed slots that meet the lead time.
- `packages/core/src/services/mentors/readiness.ts` — the one mentor bookability definition (#23's primitive, #24's `mentorOfferReady`) gains requirement key `hasBookableSlot`: met when `countBookable > 0` at `clock.now()`. The service loads the count and passes it in the subject; the requirement stays pure. `/mentor`, #27 (list eligibility) and #29 (booking) read this same definition; nothing defines a second one. If #24 has not merged, this story declares the definition with #23's page requirement plus `hasBookableSlot`, and #24 adds its price requirements to it.
- `packages/core/src/validators/availability/slot-create.schema.ts` (client-safe entry `@devmentor/core/validators`) — `{ startsAt }`: ISO-8601 UTC instant ending in `Z`, on a whole minute; non-zero seconds or milliseconds are rejected, offsets other than `Z` are rejected. Shape only; temporal policy is the service's.
- `packages/core/src/events/` — event map gains `availability.slot.published { mentorProfileId, slotId, startsAt }`; no consumer yet besides tests (the D13 supply signal, kept from the course).
- `packages/app/src/app/api/availability/slots/route.ts` (`GET`, `POST`) and `…/slots/[id]/route.ts` (`DELETE`) — `apiHandler` directly, `requireSession` then `requireRole(user, 'mentor')`, parsed input only, `user.id` passed to the service, `Cache-Control: no-store`. No `export const dynamic`.
- `packages/ui/src/backend/forms/CrudForm.tsx` — new `datetime` field type: `<input type="datetime-local">` converted local wall-clock → UTC ISO in the viewer's IANA zone, the zone shown next to the field, and the resolved instant echoed before submit ("= 16:00 UTC, Mon 22 Jun"). A local time that does not exist (spring-forward gap) is rejected with a field error; an ambiguous one (fall-back overlap) resolves to the earlier instant and the echo shows its offset.
- `packages/app/src/app/(mentor)/mentor/slots/page.tsx` + colocated `SlotsPanel.tsx` (client; one consumer) — `requirePageRole('mentor')` in the page; `DataTable` + `CrudForm` + `apiCall`; every instant through #22's `LocalTime`.
- `packages/app/src/app/(mentor)/mentor/page.tsx` (#22) — gains the "Publish a slot" step from `hasBookableSlot`.
- #23's public mentor read and `/m/[slug]` gain the `slots` field. Existence of the page is resolved by #23 before streaming (true 404); the slot read and its `clock.now()` run inside the request-time `<Suspense>` child, never under `use cache`, so the lead-time state is per request.
- `packages/core/src/cli/invite-cli.ts` — `list` gains the D13 columns per accepted invitation: `bookable slots` (`countBookable` at `clock.now()`) and `D13` = `met` (count > 0), `pending` (0, before `initial_publish_due_at`) or `missed` (0, at or after it). A snapshot at list time, operator-only, not a ranking path.

## 📝 Data Model
`slots` (new)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| mentor_profile_id | uuid not null FK `mentor_profiles`, `on delete cascade` | |
| starts_at | timestamptz not null | an instant, UTC |
| removed_at | timestamptz null | the mentor's own removal; row kept |
| created_at, updated_at | timestamptz | |

Named partial unique index `slots_mentor_starts_at_active_uq` on `(mentor_profile_id, starts_at)` where `removed_at is null` (a removed 14:00 does not block republishing 14:00); it also serves the read path. No `booking_id` column or relation, ever.

`mentor_profiles` (widened): `last_published_availability_at timestamptz null` — written with `GREATEST` in each publish transaction (republish included); never lowered on removal (it means "last published", not "has any"). An ordering key for #27, not eligibility: #27 filters by `hasBookableSlot`.

## 📝 API Contracts
| Route | Auth | Input | Answer |
|---|---|---|---|
| `GET /api/availability/slots` | `mentor` | `?scope=upcoming\|past` (default `upcoming`) | `{ items: { id, startsAt, meetsLeadTime }[] }`, non-removed; `upcoming` ascending (`startsAt > now`, at most 200 by the cap); `past` descending, last 50 |
| `POST /api/availability/slots` | `mentor` + CSRF | `slotCreateSchema` | 200 `{ id, startsAt, meetsLeadTime }`; past, now or beyond 365 days → 400 `VALIDATION_ERROR` with `fieldErrors.startsAt`; duplicate active slot or 200 active future slots → 409 `CONFLICT` |
| `DELETE /api/availability/slots/[id]` | `mentor` + CSRF | `id` uuid path param | `{ id }`; unknown, already removed or another mentor's → 404 `NOT_FOUND` (no existence leak). #29 later adds a 409 for a slot with an active booking |

All three: no session → 401; not `mentor` → 403 `FORBIDDEN`; `mentor` without a `MentorProfile` → 404 `NOT_FOUND` (as #23 and #24).

Public mentor read (owned by #23, additive field): `slots: { id, startsAt, meetsLeadTime }[]` — future, non-removed slots of a published page only, ascending, `meetsLeadTime` computed with the server clock at request time. No `removedAt`, no counts, nothing private. #29 additively adds viable lengths.

All error codes exist (`errors.ts`); every route and response field is additive (`BACKWARD_COMPATIBILITY.md`). The `[id]` path segment is used because these are owner-scoped workflow routes on `apiHandler`, not `makeCrudRoute` resources, whose `?id=` convention is unchanged.

## 📝 UI/UX
- `/mentor/slots` (app surface, shadcn): a `CrudForm` with one `datetime` field ("Start time", "Times are in <zone>", the resolved-instant echo), and a `DataTable` of upcoming slots (start via `LocalTime`, lead-time state, Remove). A "Show past" toggle switches `scope`. Empty state: "No upcoming slots. Publish one so mentees can book you." No booked state exists before #29.
- Remove asks for confirmation, then the row disappears; errors through `ErrorMessage`.
- Mentor page (#23, public, Tailwind): upcoming slots via `LocalTime`; a slot past its lead time is disabled with "Starts in less than two hours — no longer bookable". Wording never promises a booking (no "guaranteed" or "reserved"); #29 rechecks lead time and occupancy at booking. No booking button until #29. Slots render only when the mentor is `mentorOfferReady`; otherwise the page shows only "Not bookable yet", no slots (Q4 of #27/#28).
- `/mentor`: "Publish a slot" step from `hasBookableSlot`, linking to `/mentor/slots`; a slot within two hours does not satisfy it.
- No score, rating or ranking anywhere (N02), asserted as absent.

## 📝 Edge Cases & Failure Scenarios
- Client sends a timestamp already past by the server clock → 400, even though the schema accepted its shape.
- Slot at 18:00, server clock 16:00 → enabled; any instant after 16:00 → disabled with the reason (inclusive boundary).
- Slot published less than two hours ahead (but future) → accepted; shown disabled; does not count toward `hasBookableSlot` or the D13 column.
- Same start published twice, or by two tabs at once → the partial unique index lets one win; the other gets 409. A unique violation on any other constraint is not mapped to 409.
- 200th active future slot accepted, 201st → 409; two concurrent publishes at 199 → exactly one succeeds (row lock).
- Start more than 365 days ahead → 400.
- Removed slot republished at the same start → accepted; `last_published_availability_at` moves to now.
- A mentor deletes another mentor's slot id → 404; nothing changes.
- Signed-in non-mentor → 403; mentor without a `MentorProfile` → 404 (fail closed, unit- and route-tested); signed out → 401; `/mentor/slots` redirects per `requirePageRole`.
- Viewer in Warsaw publishes 18:00 local → stored as 16:00Z in summer (CEST, UTC+2) or 17:00Z in winter (CET, UTC+1) and shown at the right local time to a viewer in London.
- DST: 2027-03-28 02:30 Warsaw does not exist → field error; 2026-10-25 02:30 Warsaw is ambiguous → earlier instant (00:30Z), echoed with `+02:00`. Both transitions unit-tested.
- Mentor page unpublished or unknown (#23) → 404 before streaming; no slots exposed; the owner still manages them.
- Two app instances with skewed clocks → `GREATEST` keeps the ordering key monotonic.
- Database unreachable → `npm run build` still passes; routes fail at request time through `apiHandler`.

## ✅ Acceptance criteria
- Given a mentor, when they publish a future start time, then it appears as a slot on their page (once the mentor is offer-ready) and `last_published_availability_at` is updated in the same transaction. (issue AC1, R08)
- Given a slot at 18:00 and the server clock at 16:00, when the page renders, then the slot is enabled; once the clock is later than 16:00, then it is shown disabled with the reason. (issue AC2, reworded — see Resolved; R09)
- Given a mentor, when they remove a slot, then it disappears from their page and their table, and `last_published_availability_at` is unchanged. (issue AC3)
- Given a removed slot, when the mentor republishes the same start time, then it is accepted.
- Given a timestamp already past, or more than 365 days ahead, when the mentor publishes it, then it is refused with a field error.
- Given a duplicate active start time, then the second publish gets 409 and one slot exists; given 200 active future slots, then the next publish gets 409.
- Given another mentor's slot id, when a mentor removes it, then 404 and nothing changes; given a mentor without a profile, then every slot route answers 404 (same rule as #23 and #24).
- Given a datetime entered in the viewer's zone, then the form echoes the resolved UTC instant, the stored instant is its UTC equivalent and renders back at the same local time; a nonexistent local time is refused.
- Given only a slot starting within two hours, then `hasBookableSlot` is unmet, `/mentor` shows the step as not done and the invite list shows `bookable slots: 0`.
- Given the public payload, then each slot carries exactly `id`, `startsAt`, `meetsLeadTime` (key-equality test).
- Given `npm run invite -- list`, then each accepted invitation shows its bookable slot count and `met` / `pending` / `missed` against `initial_publish_due_at`.

## 📝 Risks & Impact Review
`risk-high` (schema migration and data scoping, `SDLC.md` risk rules; higher than the issue's `risk-medium`, recorded in the label comment): `needs-qa`, second reviewer, migration test up and down, rollback note (drop the column and table; nothing depends on them before #29). Additive everywhere: new table, column, routes, public field, readiness requirement, `CrudForm` type, event, `db` export. Main correctness risk is time-zone conversion in the browser — unit tests with fixed zones across both DST transitions. Abuse is bounded by the 200-slot cap, the 365-day horizon and the 50-row past list.

## 📝 Decisions in play
R09 / D09 (two-hour minimum, enforced at booking by #29; shown here), R08 / D08 (list order by most recent published availability), R13 / D13 (publish within two weeks; the invite list column), R02 (lengths chosen at booking, hence no length on a slot), N02 (no scores).

## ✅ Resolved
Adopted from the course reference specs on 2026-10-21:
- Single start instants, not recurring hours (closes the issue's open question).
- `Slot` never owns a booking relation; #29 adds immutable `Booking.slotId`, owns occupancy, viable lengths, overlap prevention under concurrency, and booking-aware removal.
- Soft removal with `removed_at` and a partial unique index allowing republish.
- Lead time evaluated at read time with the injected clock as `meetsLeadTime`, inclusive at exactly two hours; past instants refused by the service, not the shared schema.
- `last_published_availability_at` written in the publish transaction and never lowered on removal; ordering key, not eligibility.
- `CrudForm` `datetime` type converting local → UTC, time zone shown next to the field; every instant through `LocalTime`.
- `availability.slot.published` event after commit; "show past" toggle; `risk-high`.

Conflict between the issue and the course, resolved toward the course:
- Issue AC2 ("a slot less than two hours away cannot be booked by mentees") describes booking behaviour, and no booking exists before #29. This story shows the lead-time state on the page; #29 enforces R09 at booking time with `meetsLeadTime`. Recorded as a comment on #25 when the spec PR opens.

Deliberate differences from the course:
- (a) No `export const dynamic` on any route or page (Next 16 `cacheComponents`, `AGENTS.md`).
- (b) Inherited, not exercised here: registration sets the password from the mailed link (sign-in spec).
- (c) No `makeOwnedCollectionRoute`: our approved specs add no owner-route factories, so the routes use `apiHandler` with `requireSession`/`requireRole` and pass `user.id`; the service enforces ownership.
- (d) Error codes are ours: a past instant is 400 `VALIDATION_ERROR`, not 422.
- (e) No seeded fixtures (`seedMentorWithSlots`): the integration test drives the flow through the UI; fixtures arrive with #29.
- (f) The schema requires a whole minute, so 14:00:00 and 14:00:30 cannot both exist under the unique index.

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
All follow the course.
- Q1 (#23) Unpublished or unknown `/m/[slug]` is a true HTTP 404: #23 resolves existence before streaming starts (Next 16 `notFound()` returns 404 only before streaming; inside a started `<Suspense>` stream it stays 200), and the API route also 404s. Slots never reach an unpublished page.
- Q2 (#23) No slug renaming in 1.0; the slug is fixed from first publish.
- Q3 (#24) Platform currency (proposed USD) and the 25/50-minute bounds block #24's implementation (founder A); no invented defaults. Not blocking here: `hasBookableSlot` does not depend on prices.
- Q4 (#24) Bounds tightened below a stored price → the mentor is not bookable until they re-save; the `/mentor` checklist names the out-of-bounds price.
- Q5 (#25) A slot starting in under two hours can be published and is shown disabled, but does not count toward the D13 supply check or `hasBookableSlot` (future, non-removed, meets lead time).
- Q6 (#26) Stripe Connect moves to 1.1; the 20% fee and payouts go to a separate settlement story.
- Q7 One readiness definition: #23 owns the primitive (`evaluate`/`assert`, requirement keys); #24 adds price requirements, #25 adds `hasBookableSlot`; #27 and #29 read the same definition.

## 📝 Review notes
All review findings of 2026-10-21 applied (D13 column, `hasBookableSlot`, time-zone example, DST, request-time clock, caps, missing profile → 404 (aligned with #23 and #24), `GREATEST`, named-constraint mapping and poisoned `em`, `isUniqueViolation` export and seconds rule, dependency on merged #23). A mentor without a profile gets 404 on every slot route, aligned with #23 and #24 (consistency pass 2026-10-21 replaced an earlier 403).

## ❓ Questions from the synthetic walkthrough (2026-10-26)
Hypotheses from a synthetic persona panel (`.ai/specs/research/walkthroughs/2026-10-26-mentor-onboarding-session-001/report.md`), `[SYNTHETIC]`: questions to check with real mentors, not requirements.
- Would invited mentors publish a slot when they see the mentee's question only at session start (instant booking, D10, A06)? Check: usability task "publish one slot" with 3–5 invited mentors.
- Does a single date + time per slot fit mentor availability (recurring evenings, replies between meetings, no weekends)? Check: mentors enter their real two-week availability in the slots screen.

## ❓ Open Questions
None blocking. Non-blocking: how a mentor learns that a slot was booked — owned by the #29 spec (founder A).

## 📋 Phasing
One phase; starts only after #23 has merged (public read, `/m/[slug]`, readiness primitive); uses #22's `LocalTime`, `/mentor` and invite CLI; ships by 2026-10-31 with Epic 01.

## 📋 Implementation Plan
1. `Slot` entity, `MentorProfile.lastPublishedAvailabilityAt`, migration with the named partial unique index (`up` and `down` exercised); `isUniqueViolation(err, constraintName)` exported from `@devmentor/db`; tests incl. a violation on another constraint.
2. `lead-time.ts` (constants incl. caps) and `slot-create.schema.ts`; unit tests for the inclusive boundary, non-`Z` offsets, non-zero seconds/milliseconds, malformed input.
3. `availability.slot.published` in the event map; unit test.
4. `SlotService` + container/cradle registration; unit tests with a fixed clock: past/now/beyond-horizon refused, `GREATEST` ordering key, duplicate → `ConflictError`, cap at 200 incl. concurrency, republish after removal, removal keeps the key, ownership (other mentor → `NotFoundError`), missing profile → `NotFoundError`, scopes `upcoming`/`past` (limit 50), `countBookable` excludes slots within two hours, public list only for a published page.
5. `hasBookableSlot` in the mentor readiness definition; tests for met/unmet incl. a slot within two hours.
6. Routes and their tests (401/403, 404 for a missing profile, CSRF, 400/404/409 mapping, parsed input only, `no-store`).
7. `CrudForm` `datetime` field; tests with fixed zones: Warsaw summer and winter, the spring-forward gap refused, the fall-back overlap resolved and echoed, the zone label.
8. `/mentor/slots` + `SlotsPanel`, the `/mentor` step, `slots` on #23's public read and page inside the request-time `<Suspense>` child with the disabled state; component tests, key-equality test on the public slot shape, `expectAbsent` for scores; `npm run build` with no database.
9. `invite-cli` D13 columns (`bookable slots`, `met`/`pending`/`missed`); unit tests for each state.
10. Integration test: invite via the script → accept → fill and publish the page (#23) → set prices if #24 has merged → publish a slot tomorrow and one in one hour → signed-out visitor sees the first enabled and the second disabled → remove the first → it is gone from the page.
Each step ends with `npm run validate` green at 100% coverage; step 10 runs `npm run test:integration`.
