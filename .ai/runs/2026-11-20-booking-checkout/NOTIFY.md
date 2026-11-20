# Notify — 2026-11-20-booking-checkout

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-20T13:42:47Z — run started
- Brief: phases 2–3 of .ai/specs/2026-11-20-booking-stripe-checkout.md (#29, epic #18).

## 2026-11-20T14:00:15Z — checkpoint 1
- Backend green: lint, typecheck, 1829 tests at 100%.
- Decision: ConflictError/ServiceUnavailableError take an optional code (SLOT_TAKEN, NOT_BOOKABLE, PAYMENTS_UNAVAILABLE) — additive.
