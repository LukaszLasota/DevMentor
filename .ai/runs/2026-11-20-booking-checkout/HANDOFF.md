# Handoff — 2026-11-20-booking-checkout

**Last updated:** 2026-11-20T14:00:15Z
**Branch:** feat/booking-checkout
**PR:** https://github.com/LukaszLasota/DevMentor/pull/56
**Current phase/step:** 3.1
**Last commit:** 40546ca — booking routes

## What just happened
- Backend done: bookings table, schema, occupancy in SlotService (free lengths, booked/held, remove 409 under the lock), BookingService (hold, deadline, stale release via Stripe, confirm/orphan/expire, announce + emails), webhook handlers with after-commit follow-up, POST/GET booking routes.

## Next concrete action
- Step 3.1: SlotBookingControls in @devmentor/ui/mentors + stories; MentorPageSlot gains bookableLengths.

## Decisions
- Booking stores starts_at/ends_at snapshots (overlap query without joining slots); mentee column is mentee_id.
- /m/[slug] stays session-free: Book posts and a 401 sends the visitor to sign-in (returnTo the page).
