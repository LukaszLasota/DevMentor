# Notify — 2026-11-20-booking-checkout

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-20T13:42:47Z — run started
- Brief: phases 2–3 of .ai/specs/2026-11-20-booking-stripe-checkout.md (#29, epic #18).

## 2026-11-20T14:00:15Z — checkpoint 1
- Backend green: lint, typecheck, 1829 tests at 100%.
- Decision: ConflictError/ServiceUnavailableError take an optional code (SLOT_TAKEN, NOT_BOOKABLE, PAYMENTS_UNAVAILABLE) — additive.

## 2026-11-20T16:33:45Z — final gate and review
- Local gate green (1877 tests, 100%). Review: 2 majors + minors fixed in 95e2add.
- Blocker: the resumed session has no GitHub credentials (gh not logged in, no GH_TOKEN); commits after 40546ca are local only.
