# TC-PAYOUT-001 — A reported session is held until the operator resolves the report

- Test: [`packages/app/integration/payout-report-hold.test.ts`](../../../../packages/app/integration/payout-report-hold.test.ts)
- Spec: `.ai/specs/implemented/2026-11-21-mentor-payouts.md` (hold reasons), `.ai/specs/implemented/2026-11-20-booking-cancellation.md` phase 2 (reports), R10
- Category: payouts · Priority: High · Type: API + DB + Stripe stub (Connect, transfers) + UI

## Given–When–Then
- **Given** a mentor with payouts enabled (Connect onboarding completed on the stub) and a paid 25-minute session (150.00 PLN) that ended two days ago, which the mentee reported.
- **When** the operator presses Release payouts.
- **Then** the payout is `held` with reason `disputed`, no transfer reaches the stub, and /admin shows "Held: reported booking".
- **When** the operator marks the report resolved and releases again.
- **Then** exactly one transfer of 120.00 PLN (80%) is sent for the booking; a further release adds nothing.

## Levels checked
API (release, resolve), database (payout status, reason, net amount), Stripe stub (transfers per `transfer_group`), UI (/admin hold label).

## Edge cases not in this test
- Mentor without Connect → held `connect_not_enabled` (`mentor-payouts.test.ts`).
- Charge refunded or disputed at Stripe → held `charge_reversed` (`mentor-payouts.test.ts`).
