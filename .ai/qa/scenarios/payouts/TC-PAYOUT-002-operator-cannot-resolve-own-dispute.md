# TC-PAYOUT-002 — An operator cannot resolve a dispute on their own booking

- Test: [`packages/app/integration/report-own-booking-resolve.test.ts`](../../../../packages/app/integration/report-own-booking-resolve.test.ts)
- Threat: T-06 in `docs/security/threat-model.md` (operator who is also a mentor releases their own held payout); spec `.ai/specs/implemented/2026-11-21-mentor-payouts.md` (a reported booking is held until resolved), R10, R16
- Category: payouts · access control · Priority: High · Type: API + DB

## Given–When–Then
- **Given** an account that is both operator and mentor, another mentor, and a mentee who reported one paid booking with each of them.
- **When** the operator-mentor resolves the report on the other mentor's booking.
- **Then** 200 (positive control: the operator role works).
- **When** the operator-mentor resolves the report on their own booking.
- **Then** 403 `FORBIDDEN`, and the report is still open in the database, so the payout stays held.

## Levels checked
API (resolve, as both reports), database (`booking_reports.resolved_at`).

## Edge cases not in this test
- Refund by an operator on their own booking (`/api/admin/bookings/[id]/refund`): it moves money to the mentee, not to the operator, so it is not a self-dealing path.
- Release of payouts (`/api/admin/payouts/release`) is global and releases only eligible bookings; it cannot target one booking.
