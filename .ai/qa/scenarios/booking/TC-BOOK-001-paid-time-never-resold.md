# TC-BOOK-001 — A paid time is never resold when the payment webhook is late

- Test: [`packages/app/integration/booking-late-webhook.test.ts`](../../../../packages/app/integration/booking-late-webhook.test.ts)
- Spec: `.ai/specs/2026-11-20-booking-stripe-checkout.md` § Edge cases ("Webhook delivery is down for hours"), R10
- Category: booking · Priority: High · Type: API + DB + Stripe stub + UI

## Given–When–Then
- **Given** mentee A paid on Stripe Checkout, but the completion webhook never reached the app: the booking is still `pending_payment` and its hold has expired, so the time looks free on the mentor page.
- **When** mentee B presses Book on the same time.
- **Then** the app asks Stripe first, finds the session paid and confirms A's booking; B gets 409 `SLOT_TAKEN` and no Checkout; the slot has exactly one booking and leaves the public page.
- **And** the webhook, redelivered afterwards (the inbox lost the first delivery), is acknowledged (200) and changes nothing; no refund is created; A's page says Booked.

## Simulation note
The test lets the stub deliver the webhook, then deletes its inbox row and resets the booking to an expired hold. Side effects of that first delivery (confirmation emails, `fee_bps`) are not undone, so confirmation emails go out twice in this test; nothing asserts on them.

## Levels checked
API (409 + code), database (booking status, `confirmed_at`, one booking per slot, no refund status), Stripe stub (no refund, event delivered), UI (/bookings/[id] Booked).

## Edge cases not in this test
- Stripe unreachable while releasing the stale hold → B gets `SLOT_TAKEN` and the hold stays (unit-tested in `booking.service`).
- The stale hold's session still open → it is expired and B gets a Checkout (`booking-checkout.test.ts`).
