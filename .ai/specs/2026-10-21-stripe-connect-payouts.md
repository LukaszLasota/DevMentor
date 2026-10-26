# A mentor connects Stripe and sees whether payouts are enabled

Status: approved for 1.1
Issue: #26 (E01-S06) · Epic: #16 · Source: `.ai/specs/product-brief.md` (R07, R12, R14, R16, D11, D15, Q04) · Depends on: #22 (mentor role and `MentorProfile`); phase 2 only: the durable webhook inbox of #29 (no spec yet) · Builds on: `.ai/specs/2026-10-21-platform-primitives.md`, `.ai/specs/2026-10-21-sign-in-github-and-email.md`, `.ai/specs/2026-10-21-mentor-invitations.md`, `.ai/specs/2026-10-21-mentor-page.md` · Follows the course reference story `2026-09-08-stripe-connect-onboarding.md` (lesson 05), adapted to this repository

## 📝 TLDR
R14 makes Stripe Connect the only payout channel and requires onboarding before a mentor's first payout. As in the course, this is a **1.1** story and delivers Connect onboarding only: a mentor starts Stripe's hosted onboarding from `/mentor/payouts`, DevMentor provisions exactly one connected account per mentor, and a durable, normalized status (`action_required | pending_verification | enabled | restricted`) is visible to that mentor and the operator and to nobody else. The 20% fee, transfers and the held-payout guard (issue criteria 3 and 4) move to a separate settlement story. Implementation starts only after the Stripe topology gate (Open Questions); until then account creation fails closed with `503 CONNECT_NOT_CONFIGURED`.

## 📝 Problem Statement
R14 requires a connected account before money can reach a mentor, and R07 (proposal) says a mentor gives no bank details before the first booking. Nothing in the repository represents a connected account. Stripe's hosted onboarding is asynchronous (verification can take days), its links expire within minutes and are single-use, and account creation can succeed at Stripe while the local response is lost; a naive "create account on click" produces duplicate accounts and stale status. Settlement itself (fee, transfer, hold) cannot be designed until the charge topology is chosen, which also decides the account configuration created here.

## 📝 Proposed Solution
Stripe-hosted Connect onboarding behind a narrow port in `core`, a durable provisioning row committed before any provider call, a stable per-mentor idempotency key with bounded metadata recovery, a fresh Account Link on every start, server-rendered cached status, an explicit refresh, and webhook-driven reconciliation that always re-reads the account and never lets an older read overwrite a newer one.

**In scope:** a minimal Stripe HTTP client and its env (no spec for #29 exists; whichever story lands first builds it to this contract and the other reuses it); `ConnectAccount` (concept `payments`); `ConnectGateway` with three operations, a fake adapter and a Stripe adapter; `ConnectService` (status, start, refresh, reconcile, operator reset); mentor routes and pages; the operator's view with one reset action; the `account.updated` handler (phase 2).
**Out of scope:** Checkout (#29); the platform fee, transfers, payouts, held payouts and the payout-readiness guard (settlement story); a manual payout path (Q04); payout status on the public mentor page or in the bookability readiness definition; the durable webhook inbox itself (#29).

Alternatives considered:
- Embedded onboarding components (Stripe Connect.js) — rejected: a client SDK and a client-secret endpoint; hosted onboarding needs neither.
- Store `payouts_enabled` on `MentorProfile` — rejected (course): provider state would widen a public-facing entity.
- Trust the `account.updated` payload — rejected (course): duplicate and out-of-order events would regress state.
- Asking for Connect at invitation acceptance — rejected: R07 (proposal) and issue criterion 2.
- Wait for #29's spec to define the Stripe client — rejected: #26 would stay blocked on an unwritten spec; the client contract here is small and reusable.

## 📝 Architecture
- `packages/core/src/services/payments/stripe-client.ts` — singleton; form-encoded requests over `fetchJson` (no vendor SDK in `core`, engineering standards §1), bearer `STRIPE_SECRET_KEY`, pinned `Stripe-Version` constant, optional `Idempotency-Key`, base URL `STRIPE_API_URL`. Returns a classified outcome (below), never raw response bodies to callers; request bodies and Account Link URLs are never logged.
- `packages/db/src/entities/payments/connect-account.entity.ts` — registered in `entities/index.ts`; one migration (`up` and `down`).
- `packages/core/src/services/payments/connect-gateway.ts` — the port; `fake-connect-gateway.ts` (tests, scriptable outcomes); `stripe-connect-gateway.ts` over the client.
- `packages/core/src/services/payments/connect.service.ts` — scoped (`{ em, clock, connectGateway, connectConfiguration, rateLimiter, logger }`); `getStatus`, `start`, `refresh`, `reconcile(providerAccountId)`, `listForOperator`, `resetProvisioning(id)`. Registered in `container.ts` + `cradle.ts`; client, gateway and configuration are singletons.
- `packages/core/src/services/payments/connect-status.ts` — pure mapping `(ProviderConnectSnapshot, configuration) → { onboardingStatus, actionKeys }`.
- `packages/core/src/services/payments/connect-configuration.ts` — `ApprovedConnectConfiguration | null` (controller properties, `requiredCapabilities`, country, currency), server-owned; `null` until the topology gate is recorded here. While `null`, `start` fails closed.
- Routes (`apiHandler`, `requireSession` + `requireRole`; no `export const dynamic`): `api/mentors/me/connect/start/route.ts`, `api/mentors/me/connect/refresh/route.ts` (mentor); `api/admin/payouts/reset/route.ts` (operator).
- Pages: `(mentor)` `/mentor/payouts`, `/mentor/payouts/return`, `/mentor/payouts/reauth`; `(admin)` `/admin/payouts`. Every layout and page calls `requirePageRole`; the session and DB read sit inside `<Suspense>` and run at request time under `cacheComponents` (no `use cache`); `npm run build` with no database and no Stripe env passes. Cached status is read server-side through `withScope` — no client polling, so no GET status API. Lists use `DataTable`; states use `LoadingMessage` / `ErrorMessage` / `EmptyState`; POSTs go through `apiCall`.
- No domain event: the settlement story's guard reads the stored `onboarding_status` at transfer time, so an event would have no consumer.

Stripe client outcomes (contract): `ok` · `retryable` (timeout, network, 5xx, 429, 409 `idempotency_key_in_use`, `lock_timeout`) · `idempotency_mismatch` (400 `idempotency_error`: same key, different parameters) · `rejected` (other deterministic 4xx with Stripe's `code`) · `unavailable_account` (403/404 on an account path) · `misconfigured` (401). Needs `fetchJson` to hand back non-2xx status and body when the caller asks; an additive option, default behaviour (throw 503) unchanged — extends the primitives catalog.

Port:

| Operation | Input | Output |
|---|---|---|
| `ensureAccount` | `provisioningKey`, `mentorProfileId`, `configuration` | `ProviderConnectSnapshot` or a classified failure; creates with the stable key and metadata `{ mentor_profile_id, provisioning_key }` |
| `findAccountsByMetadata` | `mentorProfileId`, `provisioningKey` | matching snapshots, or `bound_reached`; paginates connected accounts, at most 10 pages of 100 |
| `createOnboardingLink` | `providerAccountId`, `returnUrl`, `refreshUrl` | `{ url, expiresAt }`; type `account_onboarding`; never stored |
| `retrieveAccount` | `providerAccountId` | `ProviderConnectSnapshot` or a classified failure |

`findAccountsByMetadata` is a fourth operation split out of the course's `ensureAccount` so the service, not the adapter, decides when listing runs. `ProviderConnectSnapshot`: account id, metadata, `payoutsEnabled`, `detailsSubmitted`, `capabilities` (name → `active | inactive | pending`), `currentlyDue[]`, `pendingVerification[]`, `pastDue[]`, `disabledReason`. No person, bank-account or raw requirements data crosses the port; no Checkout, refund, transfer or payout operation is on it.

## 📝 Data Model
`connect_accounts` (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| mentor_profile_id | uuid not null, unique, FK `mentor_profiles` `ON DELETE RESTRICT` | one account per mentor; a profile with a provider account is never cascaded away |
| provider_account_id | text null, unique | `acct_…`, set once, never changed |
| provisioning_key | text not null, unique | `randomToken()`; the Stripe idempotency key; rotated only by the operator reset |
| provisioning_state | text not null, `CHECK` | `pending | provisioned | reconciliation_required | failed` |
| onboarding_status | text null, `CHECK` | `action_required | pending_verification | enabled | restricted`; null until first snapshot |
| action_keys | text[] not null default `{}` | stable keys, e.g. `connect.verify_identity`; unknown provider paths → `connect.continue_onboarding` |
| diagnostic_code | text null | safe code for the operator (e.g. `connect.idempotency_mismatch`, `connect.multiple_accounts`, `connect.listing_bound_reached`, `connect.account_unavailable`, Stripe's rejection `code`), never provider payload |
| last_reconciled_at | timestamptz null | the clock time at which the applied snapshot's retrieval **started** |
| created_at, updated_at | timestamptz | |

`CHECK (provisioning_state <> 'provisioned' OR provider_account_id IS NOT NULL)`. No Account Link URL, KYC payload or raw requirements object is stored.

Status precedence (pure, unit-tested): `enabled` needs `payoutsEnabled`, no `disabledReason` and every `configuration.requiredCapabilities` (e.g. `transfers`, which both Connect charge topologies need) `active`; else `restricted` on a `disabledReason`, any `pastDue` or a required capability `inactive`; else `action_required` on any `currentlyDue` or `!detailsSubmitted`; else `pending_verification`. An unknown requirement path is logged (path only) and never treated as enabled.

Provisioning transitions (the row is committed `pending` before Stripe is called; every write locks the row with `SELECT … FOR UPDATE`):

| From | Outcome | To |
|---|---|---|
| `pending` / `reconciliation_required` | `ok` | `provisioned` |
| `pending` | `retryable`, `idempotency_mismatch` | `reconciliation_required` (+ diagnostic) |
| `pending` | `rejected` | `failed` (+ Stripe `code`) |
| any | `misconfigured` | unchanged; 503, logged as error |
| `reconciliation_required` | next start / refresh / webhook: `findAccountsByMetadata` first; one match → attach; zero → replay create with the same key; multiple or `bound_reached` | `provisioned` / `provisioned` / stays, operator |
| `failed` | mentor start | unchanged; 409 generic "contact us" (Stripe would replay the same rejection for the same key) |
| `failed` / `reconciliation_required` | operator reset (R16) | listing first: one match → `provisioned`; zero → new `provisioning_key`, `pending`; multiple → unchanged |

No create runs while a metadata listing for the row is unresolved. Recovery after Stripe prunes idempotency keys (at least 24 h) relies on listing only — the Accounts API has no metadata filter, so listing is bounded (10 × 100 accounts, ample for invited batches of 20); past the bound the row stays for the operator.

Reconcile ordering: the service records `t = clock.now()`, retrieves the account outside any transaction, then locks the row and applies the snapshot only if `t > last_reconciled_at` (or it is null). Concurrent refresh, webhook and start therefore cannot regress status. `retrieveAccount` → `unavailable_account` (deauthorized or deleted) sets `onboarding_status = restricted` with `connect.account_unavailable`, never `failed` or a new create.

## 📝 API Contracts

| Route | Method | Auth | Answer |
|---|---|---|---|
| `/api/mentors/me/connect/start` | POST (CSRF) | mentor | 200 `{ url }`, `Cache-Control: no-store`; provisions or reconciles the caller's one account, then mints a fresh link |
| `/api/mentors/me/connect/refresh` | POST (CSRF) | mentor | 200 `{ provisioningState, onboardingStatus, actionKeys, lastReconciledAt }`; retrieves and persists |
| `/api/admin/payouts/reset?id=<connectAccountId>` | POST (CSRF) | operator | 200 the row's new operator view; only from `failed` or `reconciliation_required`, else 409 |

- The mentor routes take no id: the row is always the session user's own `MentorProfile`'s.
- Rate limits via the `RateLimiter` primitive, consumed before any provider call: `connect_start` and `connect_refresh`, 10/hour each per mentor; key `<action>:user:<sha256hex(userId)>` (additive to the primitive's key forms). Over the limit → 429 `TOO_MANY_REQUESTS`.
- `CONNECT_NOT_CONFIGURED` (503): `connectConfiguration` is `null` or `STRIPE_SECRET_KEY` is missing. `ServiceUnavailableError` gains an optional `code` (default `SERVICE_UNAVAILABLE`) in its options — additive per `BACKWARD_COMPATIBILITY.md`, unit-tested for both codes, mirrored in `ui/src/backend/api/types.ts` if codes are enumerated there. Start writes no row and makes no provider call; refresh makes no call.
- Provider `retryable` → 503 `SERVICE_UNAVAILABLE`; multiple metadata matches → 409 `CONFLICT` with a generic message and the diagnostic on the row.
- The Account Link URL is redacted from logs and errors and returned only to the owning mentor. Return and reauth URLs are built from `APP_URL`.
- Webhook (phase 2, via #29's inbox): `account.updated` → `reconcile` (same function as refresh). If the provider id is not stored yet, the retrieved account's metadata locks and attaches the one matching row; missing, mismatched or multiple matches leave the inbox event retryable and operator-visible.
- Env, in the primitives' tiers, added to `env.ts`, `.env.example` and CI in the same PR (reused, not duplicated, if #29 lands first with the same names): `STRIPE_SECRET_KEY` and, phase 2, `STRIPE_CONNECT_WEBHOOK_SECRET` — optional, checked at the route; `STRIPE_API_URL` — defaulted to `https://api.stripe.com`, refused at boot when set without `ALLOW_TEST_OVERRIDES=1`.

## 📝 UI/UX
- `/mentor/payouts`: no account → "Set up payouts" (start POST, then `window.location` to the returned URL) with one line that payouts need it but publishing and bookings do not. Account → one normalized state with copy per state; `action_required` lists guidance per `actionKey` (never raw Stripe field names) and "Continue onboarding" (start POST); every state has "Refresh status". `enabled` reads "Payouts enabled". `failed` reads "We could not set up payouts — contact us".
- `/mentor/payouts/return` (Stripe `return_url`): no mutation, no provider call; shows cached state, "Stripe can take a minute to confirm your details — refresh the status shortly", and "Refresh status".
- `/mentor/payouts/reauth` (Stripe `refresh_url`): the link expired or was used; one button backed by the start POST.
- `/mentor` (from #22) gains a link to `/mentor/payouts` with the cached status.
- `/admin/payouts`: operator-only `DataTable` — display name (from #23, falling back to email), email, `onboardingStatus`, `provisioningState`, `diagnosticCode`, `lastReconciledAt`, and "Reset provisioning" on `failed` / `reconciliation_required` rows. Email is personal data shown only behind the operator guard; no other projection carries it or any Connect field.

## 📝 Edge Cases & Failure Scenarios
- Double click or two tabs on start → one row (unique `mentor_profile_id`), one provider account (same key; a concurrent 409 `idempotency_key_in_use` is retryable); each successful start returns its own fresh link.
- Crash after Stripe created the account but before the id is stored → next start or the first `account.updated` reconciles by key or metadata; never a second account.
- Same key, changed parameters (configuration edited between attempts) → `idempotency_mismatch` → `reconciliation_required`, listing attaches the existing account.
- Refresh and webhook race → the older retrieval loses the `last_reconciled_at` comparison and is discarded.
- Mentor returns before verification finishes → return page shows cached `action_required` or `pending_verification`.
- Account later restricted, a required capability goes inactive, or the account is deauthorized → `restricted` (diagnostic for the operator); settlement, reading the stored status, holds.
- Stripe credentials absent (local, CI, build) → start and refresh 503 `CONNECT_NOT_CONFIGURED`; pages, `npm run build` with no env and public pages still work.
- Mentor in a country Stripe does not serve → `rejected` → `failed` with Stripe's code; D11's review trigger; operator reset only after the cause changes.
- `mentor` role revoked later → routes and pages refuse; the row and provider account are kept. A `MentorProfile` with a Connect row cannot be deleted (`RESTRICT`).
- Mentor without Connect → publishes slots and can be booked; `mentorOfferReady` (#23–#25) has no Connect requirement (issue criterion 2).

## ✅ Acceptance criteria
- Given an approved Connect configuration and a mentor, when they start onboarding, then one connected account is provisioned durably, they are sent to Stripe's hosted onboarding and the return page shows cached status. (R14)
- Given Stripe reporting onboarding complete with the required capabilities active, when the mentor opens `/mentor/payouts` or the operator opens `/admin/payouts`, then "Payouts enabled" is shown to them and to no one else; the public mentor payload carries no Connect field. (issue criterion 1, data scoping)
- Given a mentor without Connect, then they can publish slots and be booked; no bank details are asked before the first booking. (issue criterion 2, R07 proposal, R14)
- Given concurrent starts or a crash after account creation, when onboarding is retried, then the same key and metadata reconcile to one provider account and each successful attempt issues a fresh link; `idempotency_key_in_use` and `idempotency_error` never mark the row `failed`.
- Given two concurrent reconciliations, when the older retrieval commits last, then the stored status is the newer one.
- Given the same or an out-of-order `account.updated`, when it is processed, then the handler retrieves current state and idempotently persists the normalized result.
- Given the mentor opens the page, then it renders cached state with no provider call; when they press "Refresh status", then POST fetches and persists current state.
- Given Stripe redirects the mentor back, when the return page renders, then it performs no mutation and no provider call.
- Given an expired or used link, when Stripe sends the mentor to reauth, then the page offers a fresh start through POST.
- Given credentials not configured or no approved configuration, when start or refresh is submitted, then it fails closed with `503 CONNECT_NOT_CONFIGURED`, writes no row and makes no provider call.
- Given a mentor over 10 starts or refreshes in an hour, then the next answers 429 without a provider call.
- Given a `failed` row, when the operator resets it and listing finds no account, then the row is `pending` with a new key and the mentor's next start provisions one account.
- Given two mentors with accounts, when each calls refresh or opens `/mentor/payouts`, then each sees only the row derived from their own session; a mentee or signed-out caller is refused on every route and page.

## 📝 Risks & Impact Review
`risk-high` (money, KYC, data scoping), `needs-qa`, second reviewer. Compatibility: one new table (additive, `up` and `down`), three new routes, one new error code via an additive option on `ServiceUnavailableError`, an additive `fetchJson` option, new optional env keys.
- **Topology decides account configuration** (charge type, controller properties, capabilities, negative-balance responsibility, country, currency); changing it later means re-onboarding mentors. `connectConfiguration = null` until the gate.
- **Connect webhook endpoint.** Connected-account events go to a Connect-type endpoint with its own signing secret, hence `STRIPE_CONNECT_WEBHOOK_SECRET`; step 1 verifies delivery against #29's inbox once its spec exists.
- **Q04 is live.** Connect is 1.1, so 1.0 has no automated payout; the founders must answer Q04 before the first 1.0 payout falls due (course Q19: a production-launch blocker for collecting money).
- 100% coverage: gateway via the fake; Stripe client and adapter against a stubbed `fetchJson`; an opt-in Stripe test-mode scenario runs only with explicit credentials and never gates CI.
- Rollback: set `connectConfiguration = null`, then revert application and schema changes in reverse order. Never delete or reject a provider account during rollback; keep ids and metadata.

## 📝 Decisions in play
R14 / D11 (Stripe Checkout and Connect), R12 / D15 (20% fee — settlement story), R07 (proposal), R16 / D19 (operator by hand; `OPERATOR_EMAILS`), Q04, Q-P1 (platform currency, #24).

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
- Q1 (#23): unpublished or unknown `/m/[slug]` returns a true HTTP 404, resolved before streaming starts; the API route also 404s.
- Q2 (#23): no slug renaming in 1.0; the slug is fixed from first publish.
- Q3 (#24): platform currency (proposed USD) and the 25/50-minute price bounds are a blocking open question for founder A (Q-P1/Q-P2); no invented defaults. This spec's configuration currency must equal Q-P1's answer.
- Q4 (#24): bounds tightened below a stored price make the mentor not bookable until they save again; the `/mentor` checklist names the out-of-bounds price.
- Q5 (#25): a slot starting in under 2 hours can be published and is shown disabled, but does not count toward the D13 supply check.
- **Q6 (#26): Stripe Connect moves to 1.1 as in the course; the 20% fee and payouts go to a separate settlement story. #26 and `backlog.md` must be updated to match (not done by this spec).**
- Q7: one readiness definition owned by #23 (`evaluate` / `assert` with requirement keys); #24 adds price requirements, #25 adds "has a future bookable slot"; #27 and #29 read the same definition. This story adds no requirement to it.

## ✅ Resolved
Adopted from the course reference story:
- Scope is Connect onboarding and normalized status; Checkout, fee, transfers, payouts and the payout guard have their own stories. `ConnectAccount` under `payments`; row before the provider call; stable key plus metadata recovery; the four provisioning and four onboarding states; Account Links never stored; return GET without mutation; reauth via POST; `account.updated` through the durable inbox, re-reading the account, including the earliest-event race; fail closed without credentials or configuration; rollback never deletes provider accounts.

Conflicts between issue #26 and the course, resolved toward the course:
- Criteria 3 (price minus 20%) and 4 (payout held, operator shown the mentor) go to the settlement story (fee snapshot at payment, transfer after the session, hold while the stored `onboarding_status ≠ enabled`, operator view of held payouts), filed with `om-prepare-issue` when the spec PR opens; #26 gets a comment recording the split.
- Criterion 1 "their page shows payouts as ready" → the mentor's own `/mentor/payouts` and the operator view, never the public page.
- Q04 becomes blocking for the first 1.0 payout.

Deliberate differences from the course:
- (a) No `export const dynamic`: removed under Next 16 `cacheComponents` and forbidden by `AGENTS.md`.
- (b) Operator view is a new `/admin/payouts`: the course extends `/admin/users`, which our approved specs do not have.
- (c) `CONNECT_NOT_CONFIGURED` upper case, matching `errors.ts`.
- (d) Stripe client over `fetchJson`, no SDK in `core` (standards §1); defined here because #29 has no spec.
- (e) `findAccountsByMetadata` as a fourth port operation, bounded; and an operator reset (course leaves operator reconciliation undefined).
- (f) No GET status API and no `status_changed` event: pages read server-side and settlement reads stored status.

## 📝 Review notes
- All review findings applied. The Stripe client and env are in scope here; only the webhook inbox (phase 2) remains dependent on #29's future spec, since an inbox designed here would be a second one.

## ❓ Questions from the synthetic walkthrough (2026-10-26)
Hypotheses from a synthetic persona panel (`.ai/specs/research/walkthroughs/2026-10-26-mentor-onboarding-session-001/report.md`), `[SYNTHETIC]`: questions to check with real mentors, not requirements.
- Do mentors postpone connecting Stripe until a first booking (R07 proposal, R14)? Check: Connect time relative to the first booking in the first batch.

## ❓ Open Questions
- **Stripe topology and account configuration** — separate charges and transfers or destination charges, controller properties, required capabilities, negative-balance responsibility, platform country and currency (must match Q-P1). Owner: founder A with founder B. Blocks implementation (step 1 records the answer).
- **Q04 — how a mentor is paid in 1.0 without Connect** (by hand under R16, or held). Owner: founder A with founder B. Blocks the first 1.0 payout, not this story.

## 📋 Phasing
- Phase 1 — onboarding: Stripe client and env, entity, gateway, service, routes, pages, operator view and reset; status by explicit refresh. Shippable after the topology gate.
- Phase 2 — webhook reconciliation: `account.updated` on #29's inbox with `STRIPE_CONNECT_WEBHOOK_SECRET`. Blocked until #29's spec defines the inbox.

## 📋 Implementation Plan
1. Record the approved topology, `Stripe-Version`, controller settings, `requiredCapabilities`, country, currency and operational owner here; verify Connect webhook delivery once #29's inbox is specified.
2. Stripe client, additive `fetchJson` option, env keys (`env.ts`, `.env.example`, CI), boot refusal for `STRIPE_API_URL`; tests for every outcome class and redaction.
3. `ConnectAccount` entity + migration (`up`/`down`, unique keys, `CHECK`s, `ON DELETE RESTRICT`, `text[]`); entity tests.
4. `ConnectGateway`, fake and Stripe adapters (bounded listing, outcome mapping); tests against a stubbed client.
5. `connect-status.ts`, `connect-configuration.ts`, `ServiceUnavailableError` `code` option; table-driven tests for every precedence branch, capability states and unknown paths.
6. `ConnectService` with the transition table, row locks, `last_reconciled_at` ordering, rate limits, operator reset; container + cradle; tests for every transition, concurrent start, stale-read discard, crash recovery, zero/multiple/bound matches, `unavailable_account`.
7. Routes and tests (roles, owner-from-session, CSRF, `no-store`, 429, 503 paths).
8. Pages (`Suspense`, `requirePageRole`) and the `/mentor` link; component tests for every state; a projection test that the public mentor payload has no Connect field.
9. Integration test against a Stripe stub through `STRIPE_API_URL` with `ALLOW_TEST_OVERRIDES=1`: start → return → refresh shows `enabled` → operator sees display name and status → a mentee is refused; build with no Stripe env and no DB passes and start answers 503. Opt-in Stripe test-mode scenario behind explicit credentials.
10. Phase 2: `account.updated` handler; tests for duplicates, reordering, earliest event, mismatched metadata.

Each step ends with `npm run validate` at 100% coverage; steps 7–10 also run `npm run test:integration`.
