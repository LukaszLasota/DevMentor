# Mentors connect Stripe and are paid each session minus the 20% fee

Status: implemented (branch feat/mentor-payouts) — scope and order chosen by the session owner on 2026-11-20 (#26 and #35 together, Stripe test mode on the stub, transfer only after the session); autonomous defaults below
Issues: #26 (E01-S06, Connect onboarding) and #35 (E01-S07, fee and payout) · Epic: #16 · Depends on: #29 (booking and Checkout), #30 (cancellation), #31 (sessions) · Builds on and narrows: `.ai/specs/archive/2026-10-21-stripe-connect-payouts.md` (approved for 1.1; this spec answers its topology gate and simplifies its provisioning) · Source: `.ai/specs/product-brief.md` (R12, R14, R16, D11, D15, Q04)

## 📝 TLDR
Today mentees pay DevMentor through Stripe Checkout (#29) and the money stays in the platform account; mentors are paid by hand (R16, #29 Q7). Proposed (future behaviour): a mentor connects a Stripe Express account from `/mentor/payouts` through Stripe's hosted onboarding and sees whether payouts are enabled. After a session has finished, the operator releases payouts from `/admin`: for each finished, uncancelled session, DevMentor keeps the platform fee (20%, snapshotted when the payment was confirmed) and transfers the mentor's share to their connected account. A mentor whose account is not enabled, or a session with an open dispute report, is held and listed for the operator.

## 📝 Problem Statement
The brief's mentor outcome is being paid for sessions; R12/D15 set a 20% platform fee; R14/D11 make Stripe Connect the payout channel. #26's spec stopped at a topology gate (separate charges and transfers vs destination charges). #29 already fixed the charge side: Checkout charges land on the **platform** account (no `transfer_data`). That leaves one coherent topology: **separate charges and transfers**. Without this story every payout is manual.

## 📝 Proposed Solution
**Topology (answers #26's gate):** separate charges and transfers. Connected accounts are **Express** (`type: express`, country `PL`, capability `transfers` requested), the platform carries negative balances and Stripe fees, the platform currency is PLN (#24). Each payout is one `POST /v1/transfers` of the mentor's share with `source_transaction` = the session's charge, so the transfer uses exactly that charge's funds and is never paid before the charge settles.

**Onboarding (#26, simplified):** `/mentor/payouts` → **Set up payouts** → the service creates the Express account with the stable idempotency key `connect-account-<mentorProfileId>` and metadata `{ mentor_profile_id }`, stores it (`connect_accounts`, unique per mentor), then mints a fresh Account Link (never stored) and the browser goes to Stripe. Stripe returns the mentor to `/mentor/payouts?connect=return` (or `reauth` for an expired link), where they see the stored status and **Refresh status** re-reads the account. Status is normalized from the account: `enabled` (payouts enabled, no `disabled_reason`, `transfers` active) › `restricted` (a `disabled_reason`, `past_due`, or `transfers` inactive) › `action_required` (`currently_due` or details not submitted) › `pending_verification`.

**Payouts (#35):** one payout row per booking (`payouts`, unique `booking_id`), created the first time the booking is processed with its amounts **frozen**: `gross` = the booking price, `fee = round(gross × fee_bps / 10000)` (half up), `net = gross − fee`, all integer cents; they are never recomputed. **Release payouts** on `/admin` (R16: the operator runs it; no scheduler exists) processes at most 25 **due** bookings per run and reports how many remain. A booking is due when it is `confirmed`, its session ended (`ends_at`) at least 24 hours ago (the written-answer window of #31 has closed) and its payout is not `transferred`. For each, in this order:
1. **Checks, outside any transaction** (provider reads): an unresolved dispute report (#30) → `held` (`disputed`); no connected account, or the account re-read now is not `enabled` (a 403/404 from Stripe counts as `restricted`) → `held` (`connect_not_enabled`), stored status updated; the session's charge (`GET` the Checkout Session with `expand[]=payment_intent.latest_charge`) missing → `failed` (`charge_missing`); the charge `disputed`, `refunded` or with `amount_refunded > 0` (a chargeback or a refund made in the Stripe Dashboard) → `held` (`charge_reversed`).
2. **Claim, in one transaction under the booking row lock**: re-read the payout; skip it if `transferred`, or `transferring` and updated in the last 10 minutes (another run owns it); otherwise set `transferring` and commit.
3. **Look up before creating**: `GET /v1/transfers?transfer_group=booking_<id>`; an existing transfer is adopted (`transferred`). Only when none exists is one created: `POST /v1/transfers` (`amount = net`, `currency`, `destination`, `source_transaction` = the charge, `transfer_group`, `metadata[booking_id]`) with the idempotency key `payout-<bookingId>-<attempt>`.
4. **Write the result only `WHERE status = 'transferring'`**: `ok` → `transferred` (transfer id, charge id, time); a definite refusal (`rejected`, `idempotency_mismatch`) → `failed` with Stripe's code and `attempt + 1` (the next run tries a new key, after the lookup); unknown (`retryable`, `misconfigured`, a crash) → stays `transferring`; a later run past the 10-minute mark resolves it through the lookup in step 3, so a transfer Stripe did make is adopted, never repeated — even after Stripe forgets the idempotency key (about 24 h).

The fee rate is snapshotted on the booking at confirmation (`fee_bps`, from `PLATFORM_FEE_BPS`, default 2000 = 20%, allowed 0–9999 so `net > 0`); the migration backfills 2000 on existing confirmed and cancelled bookings, and a CHECK requires it on confirmed ones. A dispute report gets `resolved_at`, set by the operator's **Mark resolved** on `/admin`, which makes the payout eligible again.

**In scope:** `connect_accounts`, `payouts`, `bookings.fee_bps`, `booking_reports.resolved_at`; `ConnectService` (`getOwn`, `start`, `refresh`), `PayoutService` (`releaseDue`, `list`); Stripe gateway operations (create account, account link, retrieve account, find transfers by group, create transfer, read a session's charge); the stub's Connect endpoints with a hosted "Complete onboarding" page, idempotency that replays errors and refuses changed parameters, and test controls; `/mentor/payouts`; `/admin` "Payouts" (held, failed and in-flight payouts, **Release payouts**) and **Mark resolved** on reports.
**Out of scope:** `account.updated` webhooks (status is re-read on refresh and before every transfer); reversing a transfer after a later refund (there is none: refunds happen only before the session, #30); the metadata-listing recovery and operator reset of the 1.1 spec (a crash between Stripe's create and our insert is covered by the idempotency key for 24 h; past that the operator reconciles by hand, R16); rate limits on start/refresh (mentors are invited; Stripe's own limits apply); payouts for sessions held before this ships beyond what **Release payouts** picks up (it does pick them up: Q04 answered "held, then released"); a payout email and a payout history for the mentor, and a `/mentor` link (follow-ups).

## 📝 Architecture
- `packages/db/src/entities/payments/connect-account.entity.ts`, `payout.entity.ts`; `bookings.fee_bps` column; one migration.
- `packages/core/src/services/payments/connect-gateway.ts` (port) with a Stripe adapter over the existing `StripeClient` and a fake: `createAccount`, `createAccountLink`, `retrieveAccount`, `createTransfer`, plus `CheckoutGateway.chargeOf(sessionId)` (the session's PaymentIntent `latest_charge`, via `expand[]`).
- `packages/core/src/services/payments/connect-status.ts` — pure normalization.
- `packages/core/src/services/payments/connect.service.ts`, `payout.service.ts` — scoped; registered in the container.
- `BookingService.applyCompleted` writes `fee_bps` at confirmation.
- Routes: `POST /api/mentors/me/connect/start`, `POST /api/mentors/me/connect/refresh` (mentor), `POST /api/admin/payouts/release` (operator). Pages: `(mentor)/mentor/payouts`, `/admin` section.
- Env: `PLATFORM_FEE_BPS` (default 2000, 0–10000). Stripe keys and `STRIPE_API_URL` are #29's.

## 📝 Data Model
`connect_accounts` (new): `id` uuid pk · `mentor_profile_id` uuid not null unique FK `mentor_profiles` restrict · `provider_account_id` text not null unique · `onboarding_status` text not null `CHECK in ('action_required','pending_verification','enabled','restricted')` · `last_reconciled_at` timestamptz not null · `created_at`, `updated_at`.

`payouts` (new): `id` uuid pk · `booking_id` uuid not null unique FK `bookings` restrict · `mentor_profile_id` uuid not null FK restrict · `gross_cents` int `> 0` · `fee_bps` smallint `between 0 and 9999` · `fee_cents` int `>= 0` · `net_cents` int `> 0` · `CHECK fee_cents + net_cents = gross_cents` · `currency` varchar(3) · `status` text `CHECK in ('held','transferring','transferred','failed')` · `hold_reason` text null `CHECK in ('connect_not_enabled','disputed','charge_reversed')`, `CHECK (status = 'held') = (hold_reason is not null)` · `attempt` smallint not null default 1 · `charge_id` text null · `transfer_id` text null unique, `CHECK status <> 'transferred' or transfer_id is not null` · `failure_code` text null · `transferred_at` timestamptz null · `created_at`, `updated_at`. Rows are financial records: never deleted; `down` refuses while rows exist.

`bookings.fee_bps` smallint null `CHECK fee_bps between 0 and 9999`, backfilled 2000 on existing confirmed and cancelled rows, `CHECK status <> 'confirmed' or fee_bps is not null`. `booking_reports.resolved_at` timestamptz null.

## 📝 API Contracts
| Route | Auth | Answer |
|---|---|---|
| `POST /api/mentors/me/connect/start` | mentor + CSRF | `{ url }` (fresh Account Link); 503 `PAYMENTS_UNAVAILABLE` without Stripe; 409 `CONNECT_FAILED` when Stripe rejects the account |
| `POST /api/mentors/me/connect/refresh` | mentor + CSRF | `{ onboardingStatus, lastReconciledAt }`; 404 without an account |
| `POST /api/admin/payouts/release` | operator + CSRF | `{ transferred, held, failed, inFlight, remaining }` for this run (at most 25 bookings) |
| `POST /api/admin/reports/[id]/resolve` | operator + CSRF | `{ resolvedAt }`; idempotent |

All `no-store`; codes additive. Stripe calls: `POST /v1/accounts` (`type=express`, `country=PL`, `capabilities[transfers][requested]=true`, `metadata[mentor_profile_id]`, idempotency key), `POST /v1/account_links` (`type=account_onboarding`, return/refresh URLs from `APP_URL`), `GET /v1/accounts/:id`, `GET /v1/checkout/sessions/:id?expand[]=payment_intent.latest_charge`, `GET /v1/transfers?transfer_group=booking_<id>`, `POST /v1/transfers` (`amount`, `currency`, `destination`, `source_transaction`, `transfer_group=booking_<id>`, `metadata[booking_id]`, idempotency key `payout-<bookingId>-<attempt>`). The mentor routes take no id (the account is always the session user's); Account Link return and refresh URLs are built only from `APP_URL`, and Account Link URLs are never logged or stored.

## 📝 UI/UX
- `/mentor/payouts`: no account → "Payouts go to your own Stripe account. You can publish times and be booked without it." + **Set up payouts**. With an account → the state ("Payouts enabled", "Stripe needs more details" + **Continue onboarding**, "Stripe is verifying your details", "Payouts are restricted — contact us") and **Refresh status**; after `?connect=return`, "Stripe can take a minute to confirm your details — refresh shortly"; after `?connect=reauth`, "The Stripe link expired" + **Continue onboarding**.
- `/admin`: "Payouts" — **Release payouts** (with the result counts and how many remain) and a table of held, failed and in-flight payouts (mentor, session, net, reason or Stripe code); "Reported bookings" gains **Mark resolved**.

## 📝 Edge Cases & Failure Scenarios
- Two **Set up payouts** clicks → the same idempotency key returns the same Stripe account; the unique `mentor_profile_id` keeps one row (a lost insert race re-reads the stored row).
- Stripe rejects the account (unsupported country) → 409 `CONNECT_FAILED`, nothing stored; the operator follows up (R16).
- Two releases at once → the claim under the booking row lock lets one run own a payout; the other skips it.
- A crash or timeout after `transferring` → stays `transferring`; after 10 minutes a run looks the transfer up by `transfer_group` and adopts it, or creates one — never two, even after Stripe forgets the idempotency key.
- Stripe refuses a transfer → `failed` with its code and `attempt + 1`; the next run looks up first, then uses a new key (an old key would only replay the stored error for 24 h).
- The fee rate changes between runs → no effect on a payout already created (amounts are frozen on the row).
- The account becomes restricted or is deauthorized → re-read before the transfer → `held`.
- A chargeback, or a refund made in the Stripe Dashboard → the charge read before the transfer → `held` (`charge_reversed`).
- A dispute report → `held` (`disputed`) until the operator marks it resolved.
- A booking cancelled before the session → never due.
- No session charge (a booking confirmed without a PaymentIntent) → `failed` (`charge_missing`).

## 📝 Risks & Impact Review
`risk-high`: the first money that leaves the platform. One payout row per booking with frozen amounts (`fee + net = gross` by CHECK, integer cents); a claimed `transferring` state with lookup-before-create, so a transfer is never duplicated even past Stripe's idempotency window; the transfer is bound to the session's own charge and refused for a reversed one. The independent review's critical findings (retry after 24 h, `transferring` recovery) and high ones (frozen amounts, chargebacks) are designed in. Releasing is an explicit operator action. Rollback: stop releasing (no automatic path exists); tables are additive.

## 📝 Decisions in play
R12/D15 (20% fee, operator-configurable — via env here), R14/D11 (Checkout + Connect), R16/D19 (operator releases, handles held and failed by hand), Q04 (answered by the session owner's choice: payouts are held until Connect, then released), #26's topology gate (answered: separate charges and transfers, Express).

## Resolved assumptions (autonomous defaults)
| # | Question | Default applied | Rationale |
|---|---|---|---|
| Q1 | Topology | Separate charges and transfers; Express accounts; platform carries losses | #29 charges the platform account; transfers with `source_transaction` follow from that |
| Q2 | When is a session due? | 24 h after `ends_at`, not cancelled | The written-answer window (#31) is over; disputes have had a day |
| Q3 | Who triggers payouts? | The operator, **Release payouts** on `/admin` | No scheduler in the project; R16 |
| Q4 | Fee snapshot | `bookings.fee_bps` at confirmation; env `PLATFORM_FEE_BPS` default 2000 | "Snapshot at payment time" (#35) |
| Q5 | Rounding | `fee = round(gross × bps / 10000)` half up; `net = gross − fee` | Integer cents; mentor gets the remainder |
| Q6 | Status freshness | Re-read on refresh and before every transfer; no webhooks | The guard needs current state; fewer moving parts |
| Q8 | Run size | 25 bookings per release, the rest reported | A bounded request |
| Q7 | Disputed sessions | Held while a report exists | R10: the operator decides |

## 📋 Implementation Plan
1. Migration + entities (`connect_accounts`, `payouts`, `bookings.fee_bps`); entity tests; `PLATFORM_FEE_BPS` env.
2. Connect gateway port, fake, Stripe adapter (incl. transfer lookup by group); `CheckoutGateway.chargeOf`; `connect-status.ts`; stub: accounts, account links with a hosted "Complete onboarding" page, transfers (list by group, idempotency replaying errors and refusing changed parameters, a "drop the response" control), a session read with an expanded charge and a control to mark it refunded or disputed; tests.
3. `ConnectService` (`getOwn`, `start`, `refresh`); `fee_bps` at confirmation; tests.
4. `PayoutService` (`releaseDue`, `list`) with checks, claim, lookup-before-create, result writes, frozen amounts; `BookingReportService.resolve`; tests incl. a crash in `transferring`, a dropped response adopted by lookup, a refusal then a new attempt key.
5. Routes; `/mentor/payouts`; `/admin` Payouts and Mark resolved; component tests.
6. Integration: mentor connects through the stub, refresh shows enabled; a session older than a day is released, the stub records one transfer of 80% bound to the session's charge; a second release changes nothing; a dropped transfer response is adopted on the next run; a mentor without Connect is held; a refunded charge is held; a mentee is refused.
Each step ends with `npm run validate` green at 100% coverage; steps 1 and 6 run `npm run test:integration`.

## Implementation notes
- `ConnectService.reconcile` is shared: the mentor's **Refresh status** and every payout check call it, so the guard always uses a status read at Stripe a moment ago (or the stored one when Stripe does not answer).
- A payout row is created on first sight as `held` (`connect_not_enabled`) with its frozen amounts, then moved by the checks; the claim is the only path to `transferring`.
- An unreadable charge (Stripe down) leaves the payout untouched for the next run, counted as in progress.
- "Payouts" joins the mentor's sidebar; the operator's release and the held/failed list sit on `/admin` next to the refunds and reports.
- Rate limits on start/refresh were left out (the `RateLimiter` subjects are email and IP; mentors are invited); Stripe's own limits apply.

