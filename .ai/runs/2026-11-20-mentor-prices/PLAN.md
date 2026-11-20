# Execution plan — mentor prices (E01-S04)

Source spec: .ai/specs/2026-10-21-mentor-prices.md
Issue: #24 · Epic: #16
Branch: feat/mentor-prices
Engine: om-auto-create-pr-loop (forced by the brief, regardless of step count)

## Tasks

> Authoritative status table. `Status` is one of `todo` or `done`. On landing a Step, flip `Status` to `done` and fill the `Commit` column with the short SHA (`self` until the next checkpoint resolves it — an amend would change the SHA it records). The first row whose `Status` is not `done` is the resume point for `om-auto-continue-pr-loop`. Step ids and `Exec` cells are immutable once the plan is committed — per-Step commits touch only `Status` and `Commit`.

| Phase | Step | Title | Exec | Status | Commit |
|-------|------|-------|------|--------|--------|
| 1 | 1.1 | Money module, session lengths and the engineering-standards money bullet | dispatch:cheap | done | dee772d |
| 1 | 1.2 | Platform price env, .env.example, CI, README and integration env | inline | done | 67023c6 |
| 1 | 1.3 | PlatformSettingsService and container registration | inline | done | 792f603 |
| 1 | 1.4 | Price columns migration and MentorProfile fields | inline | done | ec9d1f3 |
| 1 | 1.4-fix | Explicit price column names | inline | done | 289bd9c |
| 2 | 2.1 | mentorPricesUpdateSchema | inline | done | 779890d |
| 2 | 2.2 | updatePrices, price requirements in mentorOfferReady and DTO prices | inline | done | 950dd11 |
| 2 | 2.3 | PUT /api/mentors/me/prices | inline | done | 9031f12 |
| 3 | 3.1 | /mentor/prices page and sidebar item | inline | done | self |
| 3 | 3.2 | Set your prices step on /mentor with the out-of-bounds price named | inline | done | self |
| 3 | 3.3 | Prices on the public /m/[slug] page | inline | todo | — |
| 4 | 4.1 | Integration tests for prices; slot flow sets prices | inline | todo | — |

## Goal

A mentor sets a 25- and a 50-minute price in PLN within the operator's bounds on `/mentor/prices`; both show on the mentor page once offer-ready; `mentorOfferReady` gains `settings`, `price25`, `price50`; a missing configuration fails closed.

## Scope

Spec Architecture as written: `core/src/money/money.ts`, `core/src/domain/session-lengths.ts`, env (`PLATFORM_CURRENCY`, `PLATFORM_PRICE_BOUNDS`, optional, no defaults, boot refusal when malformed/half-set), `PlatformSettingsService`, migration (`price_25_cents`, `price_50_cents`, CHECK > 0), `mentorPricesUpdateSchema`, `MentorProfileService.updatePrices`, readiness requirements, DTOs (`prices`, `priceBounds`), `PUT /api/mentors/me/prices`, `/mentor/prices`, `/mentor` step, `/m/[slug]` prices. `CrudForm` `inputMode`/`suffix` already exist (lesson 06 design system) — reuse.

## Non-goals

Choosing other currencies, an operator bounds screen (E05), platform fee and payouts (#26/#35), booking price snapshots (#29), per-mentor currency.

## Implementation Plan

### Phase 1: Foundations
#### Step 1.1 — Money module, session lengths and the engineering-standards money bullet
- `parseMajorAmount` (BigInt string arithmetic, no floats, never rounds), `withinBounds`, `formatMoney` (`Intl.NumberFormat('en-US')`), `Cents` brand; `SESSION_LENGTHS = ['25','50']` + price-field mapping; re-export money from `@devmentor/core`; amend the money bullet in `.ai/specs/2026-09-01-engineering-standards.md`; tests per spec step 1.
#### Step 1.2 — Platform price env, .env.example, CI, README and integration env
- `env.ts` optional pair with boot refusal rules; approved values in `.env.example`, `ci.yml` (integration job), `integration/global-setup.ts`, README env table; env tests.
#### Step 1.3 — PlatformSettingsService and container registration
- `get` (503 when unset), `tryGet`, `boundsFor(length)`; singleton.
#### Step 1.4 — Price columns migration and MentorProfile fields
- Hand-written migration + snapshot; entity fields; CHECK > 0; entity tests.

### Phase 2: Core
#### Step 2.1 — mentorPricesUpdateSchema
- `{ price25, price50 }` exact major-decimal strings; client-safe export.
#### Step 2.2 — updatePrices, price requirements in mentorOfferReady and DTO prices
- One transaction on the caller's profile; every field error collected with the allowed range; `settings`/`price25`/`price50` requirements; owner DTO `prices`, `priceBounds`; public DTO `prices` (null unless both set and settings available).
#### Step 2.3 — PUT /api/mentors/me/prices
- Handler in `core/http/mentors.ts`, route file, tests (200/400/401/403/404/CSRF/503, no-store).

### Phase 3: UI
#### Step 3.1 — /mentor/prices page and sidebar item
- Page + client form (CrudForm `inputMode="decimal"`, `suffix="PLN"`, allowed range as help); fail-closed message when settings are missing; "Prices" sidebar item.
#### Step 3.2 — Set your prices step on /mentor with the out-of-bounds price named
#### Step 3.3 — Prices on the public /m/[slug] page
- `SessionFacts` with `formatMoney` strings when offer-ready.

### Phase 4: Integration
#### Step 4.1 — Integration tests for prices; slot flow sets prices
- New `integration/mentor-prices.test.ts`; the slots flow sets prices before expecting offer-ready (#25's step 10 "set prices if #24 has merged"); migration chain down/up still green.

## Risks

- `risk-high` (money): second reviewer, needs-qa; exact parsing (no floats) is the main correctness risk — table tests.
- `mentorOfferReady` gains price requirements: the #25 integration flow must set prices first.
- No Docker in the sandbox: integration and screenshots via CI.

## External References

None.
