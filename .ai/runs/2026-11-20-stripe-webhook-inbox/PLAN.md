# Execution plan — Stripe client and webhook inbox (E03-S01 phase 1)

Source spec: .ai/specs/2026-11-20-booking-stripe-checkout.md (spec PR #54, not yet merged — read from its branch)
Issue: #29 (phase 1 of 3 — not closed by this PR) · Epic: #18
Branch: feat/stripe-webhook-inbox
Engine: om-auto-create-pr-loop (--loop forwarded)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA (`self` until the next checkpoint resolves it). The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Additive fetchJson option returning non-2xx status and body | inline | done | 03664ed |
| 1 | 1.2 | STRIPE_* env keys, URL-override boot refusal, .env.example | inline | done | 369c719 |
| 1 | 1.3 | Stripe client: form encoding, pinned version, idempotency key, outcome classification | inline | done | c970c00 |
| 1 | 1.4 | CheckoutGateway port, fake and Stripe adapter | inline | done | 051130e |
| 1 | 1.5 | verifyStripeSignature (pure) | inline | done | 883ecbe |
| 2 | 2.1 | StripeEvent entity, migration and snapshot | inline | done | self |
| 2 | 2.2 | StripeInboxService with handler registry and container registration | inline | todo | |
| 2 | 2.3 | POST /api/webhooks/stripe (csrf off, raw body) | inline | todo | |
| 3 | 3.1 | scripts/lib/stripe-stub.mjs with unit tests | inline | todo | |
| 3 | 3.2 | Integration wiring and webhook inbox integration test | inline | todo | |

## Goal

The platform can talk to Stripe (Checkout create/expire) through a classified-outcome client behind a port, and receives Stripe webhooks durably: verified, stored once in `stripe_events`, dispatched once to a registered handler, retried by Stripe on failure. No user-visible change; unblocks phase 2 (booking) and #26 phase 2.

## Scope
- core: `http/outbound.ts` option, `config/env.ts`, `services/payments/{stripe-client,checkout-gateway,fake-checkout-gateway,stripe-checkout-gateway,webhook-signature,stripe-inbox.service}.ts`, `http/stripe-webhook.ts`, container + cradle.
- db: `entities/payments/stripe-event.entity.ts`, one migration + snapshot.
- app: `api/webhooks/stripe/route.ts`; integration setup + test.
- scripts: `lib/stripe-stub.mjs`.

## Non-goals
Booking entity and service, occupancy, UI, emails (phase 2); real Stripe test-mode scenario; CI workflow edits (token lacks workflow scope — integration env is set in global-setup).

## Risks
- The spec PR #54 is unmerged; the spec file is not committed on this branch.
- No Docker in the sandbox: integration runs only in CI.
