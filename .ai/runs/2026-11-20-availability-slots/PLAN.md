# Execution plan — availability slots (E01-S05)

Source spec: .ai/specs/2026-10-21-availability-slots.md
Issue: #25 · Epic: #16
Branch: feat/availability-slots
Engine: om-auto-create-pr-loop (forced by the brief, regardless of step count)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA. The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed — per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Slot entity, last_published_availability_at, migration and isUniqueViolation | inline | done | c47f4c7 |
| 2 | 2.1 | Lead-time rule and slotCreateSchema | inline | done | cff3041 |
| 2 | 2.2 | availability.slot.published event | inline | done | cc6f832 |
| 2 | 2.3 | SlotService and container registration | inline | done | c28b192 |
| 2 | 2.4 | hasBookableSlot in mentorOfferReady and slots on the public mentor read | inline | done | 327ba2e |
| 2 | 2.5 | Slot owner routes and HTTP handlers | inline | done | self |
| 3 | 3.1 | CrudForm datetime field | inline | done | self |
| 3 | 3.2 | MentorPageView shows slots when offer-ready without prices | inline | done | self |
| 3 | 3.3 | /mentor/slots page, sidebar item and the /mentor slot step | inline | todo | — |
| 3 | 3.4 | Slots on the public /m/[slug] page | inline | todo | — |
| 4 | 4.1 | invite-cli D13 columns | dispatch:cheap | todo | — |
| 4 | 4.2 | Integration tests for slots | inline | todo | — |

## Goal

A mentor publishes single start instants on `/mentor/slots`, sees and removes them; future slots appear on the public page while the mentor is offer-ready, each enabled until exactly two hours before its start; `hasBookableSlot` joins the one bookability gate; the invite list shows the D13 state.

## Scope

- `db`: `slots` table (named partial unique index `slots_mentor_starts_at_active_uq`), `mentor_profiles.last_published_availability_at`, migration up/down, `isUniqueViolation(err, constraint)` export.
- `core`: `services/availability/lead-time.ts`, `validators/availability/slot-create.schema.ts`, `SlotService` (`listMine`, `publish`, `remove`, `listPublicFor`, `countBookable`), event `availability.slot.published`, `hasBookableSlot` in `mentorOfferReady`, `http/availability.ts` handlers.
- `app`: `GET/POST /api/availability/slots`, `DELETE /api/availability/slots/[id]`; `/mentor/slots`; slot step on `/mentor`; slots on `/m/[slug]`.
- `ui`: `CrudForm` `datetime` type; reuse Storybook `SlotsPanel`, `DataTable`/`LocalTime`; `MentorPageView` renders slots when offer-ready even before prices exist; sidebar "Open times".
- `invite-cli list`: `bookable slots` + D13 `met`/`pending`/`missed`.

## Non-goals

Booking, occupancy, viable lengths, booked state, booking-aware removal (#29); cancellation; notifications; recurring availability; calendar sync; seed fixtures; prices (#24, blocked on Q-P1/Q-P2).

## Implementation Plan

### Phase 1: Data

#### Step 1.1 — Slot entity, last_published_availability_at, migration and isUniqueViolation
- `packages/db/src/entities/availability/slot.entity.ts` (uuid, `mentorProfile` manyToOne cascade, `startsAt`, `removedAt`, timestamps), registered; partial unique index `slots_mentor_starts_at_active_uq` on `(mentor_profile_id, starts_at) where removed_at is null`.
- `MentorProfile.lastPublishedAvailabilityAt` nullable.
- Hand-written migration + snapshot (no DB in the sandbox, as in #23); `isUniqueViolation(err, name)` exported from `@devmentor/db`; entity and export tests.

### Phase 2: Core

#### Step 2.1 — Lead-time rule and slotCreateSchema
- `BOOKING_LEAD_TIME_MINUTES = 120`, `meetsLeadTime(startsAt, now)` inclusive; `MAX_ACTIVE_FUTURE_SLOTS = 200`, `MAX_HORIZON_DAYS = 365`, `PAST_LIST_LIMIT = 50`.
- `slotCreateSchema` `{ startsAt }`: ISO UTC ending in `Z`, whole minute; exported from `@devmentor/core/validators`.

#### Step 2.2 — availability.slot.published event
- One `DomainEvents` entry `{ mentorProfileId, slotId, startsAt }`; test.

#### Step 2.3 — SlotService and container registration
- Owner methods resolve the caller's profile (404 without), publish in one transaction under the profile row lock: past/now/beyond 365 days → `ValidationError` on `startsAt`; ≥ 200 active future → `ConflictError`; insert; `last_published_availability_at = GREATEST(…)`; named-index violation → `ConflictError`; event after commit. `remove` soft-removes own non-removed slot else 404. `listMine(scope)` upcoming asc / past desc 50. `countBookable`, `listPublicFor`.

#### Step 2.4 — hasBookableSlot in mentorOfferReady and slots on the public mentor read
- `mentorOfferReady` gains `hasBookableSlot` (subject carries `bookableSlots`); `MentorProfileService.findPublicBySlug` adds `offerReady` and `slots` (only when offer-ready); `findOwn` adds the offer readiness for `/mentor`.

#### Step 2.5 — Slot owner routes and HTTP handlers
- `core/src/http/availability.ts` + route files; 401/403/404/CSRF/no-store; route tests.

### Phase 3: UI

#### Step 3.1 — CrudForm datetime field
- `datetime-local` → UTC ISO in the viewer's zone, zone label, resolved-instant echo, spring-forward gap refused, fall-back overlap → earlier instant with its offset. Fixed-zone tests (Europe/Warsaw both DST transitions).

#### Step 3.2 — MentorPageView shows slots when offer-ready without prices
- Slots render when `offerReady`; price facts only when prices exist (#24 adds them).

#### Step 3.3 — /mentor/slots page, sidebar item and the /mentor slot step
- Page + colocated client container using `CrudForm` (datetime) + Storybook `SlotsPanel` + `apiCall`; "Publish a slot" step from `hasBookableSlot` linking to `/mentor/slots`; sidebar item.

#### Step 3.4 — Slots on the public /m/[slug] page
- Pass `offerReady` and `slots` to `MentorPageView`; tests incl. the disabled state and absent ratings.

### Phase 4: CLI and integration

#### Step 4.1 — invite-cli D13 columns
- `list` prints `bookable slots: <n>` and `D13: met|pending|missed` per accepted invitation (count at `clock.now()` vs `publish_due_at`); unit tests per state.

#### Step 4.2 — Integration tests for slots
- `integration/availability-slots.test.ts`: invite → accept → publish page → publish a slot tomorrow and one in one hour → signed-out visitor sees the first enabled and the second disabled → remove the first → gone; route-level 401/403/404/409; schema test for the partial unique index, migration down/up.

## Risks

- `risk-high`: schema migration and data scoping; second reviewer, needs-qa, migration test up/down.
- Time-zone conversion in the browser: fixed-zone unit tests across both DST transitions.
- No Docker in the agent sandbox: integration tests and screenshots run in CI only; UI checkpoint passes record the skip.
- #24 not merged: `mentorOfferReady` = published + hasBookableSlot for now; #24 adds its price requirements.

## External References

None (no `--skill-url`).
