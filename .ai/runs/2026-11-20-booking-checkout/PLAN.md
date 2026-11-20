# Execution plan — booking and Stripe Checkout (E03-S01 phases 2–3)

Source spec: .ai/specs/2026-11-20-booking-stripe-checkout.md (phase 1 merged in #55)
Issue: #29 · Epic: #18
Branch: feat/booking-checkout
Engine: om-auto-create-pr-loop

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA (`self` until the next checkpoint resolves it). The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Booking entity, migration and snapshot | inline | done | 17991a5 |
| 1 | 1.2 | bookingStartSchema validator | inline | done | 721f471 |
| 2 | 2.1 | Occupancy: bookableLengths, booking-aware counts, owner booking state, remove under the profile lock | inline | done | 8ace4cd |
| 2 | 2.2 | BookingService.start with hold, deadline and stale-hold release through Stripe | inline | done | a35683f |
| 2 | 2.3 | Checkout webhook handlers, after-commit hook, bookings.booking.confirmed and emails | inline | done | c7a0d2b |
| 2 | 2.4 | POST /api/bookings and GET /api/bookings/[id] | inline | done | 40546ca |
| 2 | 2.5 | Release the mentee's own hold on Checkout cancel (POST /api/bookings/[id]/release) | inline | done | self |
| 3 | 3.1 | SlotBookingControls in @devmentor/ui/mentors with stories | inline | done | self |
| 3 | 3.2 | /m/[slug] booking wiring and the cancelled notice | inline | done | self |
| 3 | 3.3 | /bookings/[id] status page | inline | done | self |
| 3 | 3.4 | /mentor/slots Booked and Held states | inline | todo | |
| 4 | 4.1 | Integration: book, pay, cancel, race, redelivery, unconfigured | inline | todo | |
| 4 | 4.2 | Spec implementation notes and status | inline | todo | |

## Goal

A signed-in mentee books an open time at least two hours ahead (25 or 50 minutes), sees the server-held price, pays through Stripe Checkout; the time is held while they pay; a signed webhook confirms it; abandoned payment releases it; two mentees racing → one Checkout. AC1–AC5 of #29.

## Non-goals
Cancellation and refunds (#30), the session itself (#31), payouts (#26/#35), a mentee bookings list, reminders, payment methods other than card.

## Risks
- Money and concurrency: the profile row lock serializes every booking of one mentor; the unique active-slot index backstops it.
- No Docker in the sandbox: integration only in CI.
