# A mentor sets 25- and 50-minute prices within operator bounds

Status: approved (implementation blocked on Q-P1/Q-P2: currency and bounds, founder A)
Issue: #24 (E01-S04) · Epic: #16 · Depends on: #23 (`.ai/specs/2026-10-21-mentor-page.md`, readiness primitive and `/m/[slug]`) · Source: `.ai/specs/product-brief.md` (R02, R12, D14, R16) · Builds on: `.ai/specs/2026-10-21-platform-primitives.md`, `.ai/specs/2026-10-21-sign-in-github-and-email.md`, `.ai/specs/2026-10-21-mentor-invitations.md` · Sibling: `.ai/specs/2026-10-21-availability-slots.md` (#25) · Follows the course reference specs `2026-09-08-mentor-prices.md`, `2026-09-08-mentors-become-bookable.md` (Slice 4) and `2026-09-08-platform-primitives-ii.md` (B12′, B16′, F5′ `money`), adapted to this repository

**Why not a thin spec like the course's.** The course's mentor-prices spec is a thin story spec because its Platform Primitives II document is the design authority for money, settings and the readiness gate. This repository's approved `platform-primitives` spec covers neither money nor platform settings, so this spec carries those contracts (money module, `PlatformSettingsService`, env tier, price requirements) itself; the readiness primitive stays in #23 and is only referenced here.

## 📝 TLDR
R12 lets each mentor set their own 25- and 50-minute prices within operator-set bounds; the repository has no price, no currency and no bounds, so nothing can later be booked at a known amount (#29). A mentor saves both prices together on `/mentor/prices` in one platform currency; the server parses the decimal strings exactly into integer cents and refuses any value outside the bounds, naming the allowed range. Both prices show on the mentor page once the mentor is offer-ready; a mentor who is not offer-ready shows only "Not bookable yet": no prices, no slots, no booking action. Bounds are set by hand (R16) in configuration read through one `PlatformSettingsService`. The platform currency and the initial bounds are founder decisions that block implementation; everything else is designed.

## 📝 Problem Statement
R12 / D14 (founder A): mentors set prices, the operator sets bounds. R02: sessions are 25 or 50 minutes. #29 (booking and Stripe Checkout) needs a server-held price per length to charge and snapshot; the client never supplies an amount (engineering standards §1). Without one owner of bounds, every caller (this form, the booking service, a later operator screen) would read configuration its own way; without one bookability definition, the list (#27), the mentor page and booking (#29) would disagree on who can be booked.

## 📝 Proposed Solution
Two nullable integer-cent columns on `mentor_profiles`; one platform currency and one bounds object behind `PlatformSettingsService`; exact decimal-to-cents parsing in a small money module; one `PUT` route saving both prices atomically; the existing `CrudForm` `text` field with generic `inputMode` and `suffix` props; and price requirements added to the single bookability gate `mentorOfferReady`, built on #23's readiness primitive.

**In scope:** two prices in one platform currency; the settings service and its env variables; exact parsing and range checks; refusal naming the breached range per field; the price requirements of `mentorOfferReady`; `/mentor/prices`; prices (or "Not bookable yet") on `/m/[slug]`; a "Set your prices" step on `/mentor`; the engineering-standards money bullet amendment.
**Out of scope:** choosing the currency or bound values (founders, Q-P1/Q-P2); an operator screen for bounds (E05 parked; R16 by hand); the 20% platform fee and payouts (a separate settlement story; Stripe Connect is 1.1, see Resolved Q6); the booking's price snapshot (#29); per-mentor or multiple currencies; the slot requirement of `mentorOfferReady` (#25).

Alternatives considered:
- **Bounds in a database table with an operator screen now** — rejected: no operator screen in 1.0 (R16, E05 parked); the service keeps the swap to a table a storage change.
- **Four scalar env variables** (`MIN_25`, `MAX_25`, …) — rejected (course): one `PLATFORM_PRICE_BOUNDS` object validated together with the currency keeps unit and bounds in one place.
- **Per-mentor currency column** — rejected (course): 1.0 has one platform currency; a currency with different minor units is a schema and arithmetic change, not configuration.
- **Bounds checked in the shared Zod schema** — rejected: the schema runs on the client, which cannot read operator settings; shape in the schema, policy in the service.
- **`isBookable(profile)` boolean** — rejected (course): a readiness gate says *why* a mentor is not bookable and feeds both the refusal and the checklist.
- **A new `money` `CrudForm` field type** (course F5′) — rejected: a `text` input with `inputMode="decimal"` and a `suffix` prop already keeps the value a string for exact server parsing; two generic props are reusable and smaller than a domain-specific type.

## 📝 Architecture
- `packages/core/src/money/money.ts` — `Cents` (branded integer); `parseMajorAmount(str): Cents` (string/BigInt arithmetic, no floats, never rounds); `withinBounds(cents, { minCents, maxCents })`; `formatMoney(cents, currency)` — `Intl.NumberFormat` pinned to `en-US`, display only, so server and client render identically. Re-exported from `@devmentor/core`; no new subpath.
- `packages/core/src/domain/session-lengths.ts` — `SESSION_LENGTHS = ['25', '50']` (R02) with a helper mapping a length to its price field; string keys because they are also column suffixes.
- `packages/core/src/services/operator/platform-settings.service.ts` — `PlatformSettingsService` (singleton, `{ env }`): `get(): { currency, bounds: { '25': PriceBounds, '50': PriceBounds } }`, `boundsFor(length)`, and `tryGet()` returning `null` when unconfigured. `get` throws `ServiceUnavailableError` when settings are missing (fail closed). Reads env now; a later table sits behind the same methods. Registered in `container.ts` + `cradle.ts`.
- `packages/core/src/services/mentors/mentor-profile.service.ts` (from #23) — gains `updatePrices(userId, { price25, price50 })`: reads settings (`get`, 503 if missing), parses both, checks both against current bounds, collects every field error, then writes both in one transaction on the caller's own profile (looked up by the session user id, never a client id; no row → `NotFoundError`, as #23's owner routes).
- `packages/core/src/services/mentors/readiness.ts` (from #23) — `mentorOfferReady` is the **single bookability gate**, defined with #23's `defineReadiness` from `packages/core/src/domain/readiness.ts` (`evaluate → { key, met }[]`, `assert` → `ValidationError` keyed by requirement). This spec does not redefine the primitive, `mentorPagePublishable` or #23's `published` requirement (the page is published); it contributes these requirement keys:
  - `settings` — platform settings available (`tryGet() !== null`); unmet instead of throwing, so pages render;
  - `price25`, `price50` — set and within the *current* bounds; keys equal the form field names.
  #25 adds `hasBookableSlot` (a future, non-removed slot meeting the two-hour lead time). #27 (list) and #29 (booking, via `assert`) read this same definition; nothing else decides bookability.
- `packages/core/src/validators/mentors/mentor-prices-update.schema.ts` — client-safe, through `@devmentor/core/validators`.
- `packages/app/src/app/api/mentors/me/prices/route.ts` — `PUT` via `apiHandler` (CSRF central), `requireSession` + `requireRole(user, 'mentor')`, `parseJsonBody` with the schema, then `updatePrices`. `Cache-Control: no-store` like #23's owner routes. No `export const dynamic`.
- `packages/app/src/app/(mentor)/mentor/prices/page.tsx` — calls `requirePageRole('mentor')` itself; reads the owner DTO through `withScope`; formats bounds with `formatMoney` and passes strings and the currency as props (`ui` never imports `core`). Settings unavailable → renders a fail-closed message ("Prices cannot be set right now") and no form.
- `packages/ui/src/backend/forms/CrudForm.tsx` — the `text` field gains optional `inputMode` and `suffix` props (additive); the value stays a string.
- `/m/[slug]` and `/mentor` (from #23 / #22) render prices and readiness from the projections below; `ReadinessChecklist` (#23) renders the requirements.

## 📝 Data Model
`mentor_profiles` (from #22/#23), widened by one migration (`up` and `down`):

| Column | Type | Notes |
|---|---|---|
| price_25_cents | integer null | minor units of the platform currency; `CHECK (price_25_cents > 0)` |
| price_50_cents | integer null | same; `CHECK (price_50_cents > 0)` |

The currency is not stored per mentor. `updatePrices` always writes both. Changing the platform currency after prices or bookings exist is a data migration, never a config-only change.

## 📝 API Contracts
| Route | Auth | Body | Answer |
|---|---|---|---|
| `PUT /api/mentors/me/prices` | `requireSession` + `requireRole('mentor')`, CSRF | `{ price25: string, price50: string }` | 200 owner DTO; 400 `VALIDATION_ERROR` with `fieldErrors.price25` / `fieldErrors.price50` naming the allowed range (e.g. "Allowed: $20.00–$150.00"); 401 / 403 from the guards; 404 `NOT_FOUND` when the mentor has no profile row; 503 `SERVICE_UNAVAILABLE` when settings are missing |

- Schema: `exactMajorDecimalString = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/)` — shape only: no signs, exponents, separators, whitespace or more than two fractional digits. **One business ceiling:** the bound's `maxCents`. `parseMajorAmount` cannot overflow (BigInt), so any too-large value is refused by the bounds check with the range named; no separate length cap or integer-maximum guard. The env check keeps every `maxCents ≤ 2_147_483_647` so stored values fit `integer`.
- Projections (key-equality tests): public DTO gains `prices: { price25Cents: number; price50Cents: number; currency: string } | null` (null unless both are set and settings are available) and `offerReady: boolean`; owner DTO gains the same `prices`, `priceBounds: { p25: { minCents, maxCents }, p50: { minCents, maxCents } } | null`, and the `mentorOfferReady` evaluation. Bounds never cross the public projection. No formatted strings in DTOs.
- Env, in `core/src/config/env.ts` and `.env.example`, `ci.yml` and `README.md` in the same PR (`BACKWARD_COMPATIBILITY.md`), tiered as in the platform-primitives spec:
  - **Optional, checked at the route** (no default in `env.ts`; missing → `PlatformSettingsService` unavailable → 503 on save, `settings` requirement unmet on reads; build and boot unaffected): `PLATFORM_CURRENCY` (ISO 4217, two-decimal currency) and `PLATFORM_PRICE_BOUNDS` (JSON `{"25":{"minCents":n,"maxCents":n},"50":{"minCents":n,"maxCents":n}}`).
  - **Dangerous configuration refuses boot** when set but malformed: unknown or non-two-decimal currency, non-integer or ≤ 0 cents, `minCents > maxCents`, `maxCents > 2_147_483_647`, a missing length, or only one of the two variables set.
  - `ci.yml` and the integration runner set explicit test values; no commercial value ships in code or `.env.example` (placeholders are commented out).
- No new domain event (no consumer yet).

## 📝 UI/UX
- `/mentor/prices` (shadcn, `(mentor)` group): two `text` fields (`inputMode="decimal"`, currency `suffix`), "25 minutes" and "50 minutes", each with the allowed range as help text; the currency is printed, never selectable. One Save saves both. A refusal shows the range under the offending field(s); nothing is saved. Settings unavailable → fail-closed message, no form.
- `/mentor`: the checklist gains "Set your prices" from `mentorOfferReady`, linking to `/mentor/prices`; an out-of-bounds stored price is named ("Your 50-minute price $200.00 is above the allowed $150.00 — save a new price").
- `/m/[slug]`: when offer-ready, both prices formatted ("25 min · $40.00", "50 min · $75.00"). A published mentor who is not offer-ready shows only "Not bookable yet": no prices, no slots (#25) and no booking action (Q4 of #27/#28).

## 📝 Edge Cases & Failure Scenarios
- One valid and one invalid price → 400 naming the invalid field; neither price changes.
- `20.00` → 2000; `20` → 2000; `20.5` → 2050; `20.005`, `-5`, `1e3`, `1,000`, `" 20"` → refused by the schema, never rounded.
- A very long digit string → parsed exactly, refused by the bounds check naming the range.
- Bounds tightened below a stored price → stored prices are not rewritten; the `price25`/`price50` requirement is unmet, so the mentor is not bookable until they save again, and `/mentor` names the out-of-bounds price. Bookings already made keep their snapshot (#29).
- Settings missing → save 503, no write; `/mentor/prices` shows the fail-closed message; `mentorOfferReady` reports `settings` unmet (no exception), so `/m/[slug]` shows "Not bookable yet".
- A non-mentor calls the route → 403; signed out → 401; missing CSRF header → refused by `apiHandler`.
- The mentor has no profile row → 404 (should not happen after #22; covered by a route test, as in #23).
- Two concurrent saves → last committed wins; both values always come from one request (single transaction).
- No database or price env at build time → `npm run build` passes; settings are read at request time.

## ✅ Acceptance criteria
- Given operator bounds set by hand under R16, when a mentor sets a 25-minute and a 50-minute price inside them, then both show on `/mentor/prices`, and on their mentor page once the mentor is offer-ready. (R12, R02; issue criterion 1)
- Given a price outside the bounds, when the mentor saves, then the save is refused and the allowed range is shown for that field. (R12; issue criterion 2)
- Given the operator changes the bounds by hand (configuration change, logged in the shared note), when a mentor saves afterwards, then the prices are checked against the new bounds and existing stored prices are not rewritten. (R16; issue criterion 3, see Resolved)
- Given bounds tightened below a stored price, then the mentor is not bookable and `/mentor` names the out-of-bounds price until they save a valid one. (Q4)
- Given a published mentor without both valid prices, when a visitor opens the page, then the page says only "Not bookable yet", with no prices, no slots and no booking action. (Q4)
- Given `20.00`, then exactly `2000` cents is stored; given more than two fractional digits, then the save is refused rather than rounded. (money)
- Given one valid and one invalid price, then neither price changes.
- Given the price settings are unset, then saves answer 503, the prices page shows a fail-closed message and readiness reports `settings` unmet; given them set but malformed, then boot is refused. (misconfiguration)
- Given owner or public price data is read, then prices are integer cents plus the platform currency, and only the owner DTO includes bounds. (projection, key-equality test)
- Given a mentee or operator without `mentor`, when they call `PUT /api/mentors/me/prices`, then 403 and nothing changes.

## 📝 Risks & Impact Review
`risk-high` (money): second reviewer and `needs-qa`. Compatibility: two additive nullable columns (migration with `up` and `down`); two new optional env variables (`env.ts`, `.env.example`, `ci.yml`, `README.md` together); `CrudForm` `text` gains two optional props; DTOs gain fields; `mentorOfferReady` gains requirements (additive keys). The engineering standards' money bullet ("price recomputed from `mentor.rate × duration`") predates R12's per-length prices; step 1 amends it to "the booking price is the server-held price for the chosen length", as the sign-in spec did for bcrypt. A zero- or three-decimal currency needs an arithmetic and migration design; config alone is refused at boot.

## 📝 Decisions in play
R12 / D14 (prices within operator bounds, founder A), R02 / D01 (25 or 50 minutes), R16 / D19 (operator acts by hand, logged in the shared note), R06 / R14 (Stripe, consumed by #29), D15 (20% fee, settlement story), D13 (supply check, #25), D17 (ship 2026-10-31).

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
All following the course.
- **Q1 (#23)** Unpublished or unknown `/m/[slug]` is a true HTTP 404, resolved before streaming starts; the API route also 404s. Owned by #23; this spec only adds price data to that page.
- **Q2 (#23)** No slug renaming in 1.0; the slug is fixed from first publish.
- **Q3 (#24)** Platform currency (proposed USD) and the 25/50-minute bounds are a blocking open question for founder A (Q-P1, Q-P2). No invented defaults; implementation is blocked, everything else is designed.
- **Q4 (#24)** Bounds tightened below a stored price → the mentor stops being bookable until they save again; the `/mentor` checklist names the out-of-bounds price. (Former Q-P3, closed.)
- **Q5 (#25)** A slot starting in under two hours can be published and is shown disabled, but does not count toward the D13 supply check (only future, non-removed slots meeting the lead time count).
- **Q6 (#26)** Stripe Connect moves to 1.1 as in the course; the 20% fee and payouts go to a separate settlement story. #26 and `backlog.md` must be updated accordingly (not by this spec's PR).
- **Q7** One readiness definition: #23 owns the primitive (`evaluate` / `assert` with requirement keys); #24 adds the `settings`, `price25`, `price50` requirements to `mentorOfferReady`; #25 adds `hasBookableSlot`; #27 and #29 read the same definition.

## ✅ Resolved (from the course, 2026-10-21)
- One platform currency for 1.0; `PLATFORM_CURRENCY` plus one `PLATFORM_PRICE_BOUNDS` object behind `PlatformSettingsService`; no placeholder commercial values.
- Integer cents, `CHECK > 0`, exact string parsing, two decimals, excess precision refused, never rounded.
- Both prices saved together in one transaction; one invalid value changes nothing.
- Shape in the shared schema, bounds in the service; the form receives currency and bounds as props.
- Readiness gate, not a boolean; "Not bookable yet" with no booking action.
- Owner DTO carries bounds, public DTO never does; no formatted strings in DTOs.
- No fee helper or `PLATFORM_FEE_PERCENT` before its first caller (settlement story).
- A price or policy change never moves an existing obligation.

Conflict between issue #24 and the course, resolved toward the course: criterion 3 ("the operator changes the bounds") assumes an operator screen that E05 parks; the operator changes bounds by hand under R16 (configuration and deploy, logged in the shared note), and every later save is checked against current bounds. Recorded as a comment on #24 when the spec PR opens. Criterion 1 is extended with the course's money, atomicity, fail-closed and "Not bookable yet" criteria.

Deliberate differences from the course:
- (a) No `export const dynamic` (removed under Next 16 `cacheComponents`, forbidden by `AGENTS.md`).
- (b) A breached bound answers 400 `VALIDATION_ERROR` with `fieldErrors`, not the course's 422, which this repository does not define.
- (c) The route is a plain `apiHandler` with `requireSession` / `requireRole`, not the course's `makeOwnedResourceRoute`, which our approved specs do not add.
- (d) `mentorOfferReady` also requires each price within the *current* bounds (course epic: "both prices inside bounds").
- (e) No `money` `CrudForm` type: `text` with `inputMode` and `suffix` props (see Alternatives).
- (f) Price env is the optional route-checked tier with no defaults, instead of the course's founder-approved defaults, so an unanswered Q-P1/Q-P2 cannot ship a value.
- (g) One business ceiling (`maxCents`) instead of the course's 11-character cap plus integer-maximum guard.

## ❓ Open Questions
- **Q-P1 Platform currency** (owner: founder A). Proposed: USD (beachhead English-speaking, D24; benchmarks priced in USD). Blocking before implementation.
- **Q-P2 Initial 25- and 50-minute bounds** (owner: founder A with founder B). No value proposed; evidence is thin (Codementor $15–80 per 15 min; one interview "fifty euro?"). Blocking before implementation.

## 📝 Review notes
All review findings were applied; none rejected. The `money` CrudForm type finding was applied because the course's justification (keep the value a string) is met by `text` with `inputMode`/`suffix`.

## 📋 Phasing
One phase, one PR, after #23 is merged and Q-P1/Q-P2 are answered; ships with Epic 01 by 2026-10-31.

## 📋 Implementation Plan
1. Amend the money bullet of `.ai/specs/2026-09-01-engineering-standards.md`; `core/src/money/money.ts` and `core/src/domain/session-lengths.ts`; tests: exact conversion table, schema-shaped rejects, long inputs, `withinBounds` edges (min, max, ±1 cent), `formatMoney` in `en-US`.
2. `PLATFORM_CURRENCY`, `PLATFORM_PRICE_BOUNDS` in `env.ts` (optional, no defaults, boot refusal when malformed or half-set); `.env.example`, `ci.yml` test values, `README.md`; env tests for unset, valid, malformed, `min > max`, `max` above integer range, missing length, one variable only.
3. `PlatformSettingsService` + container/cradle; tests for `get`, `tryGet`, `boundsFor`, and 503 when unset.
4. Migration (`up` and `down` exercised) and `MentorProfile` fields; constraint test that the database rejects `0` and negatives.
5. `mentorPricesUpdateSchema`; `MentorProfileService.updatePrices`; `settings`/`price25`/`price50` requirements added to `mentorOfferReady` (declared in #23's `readiness.ts`); DTO changes with key-equality tests; tests for inside/outside bounds, one-valid-one-invalid, no profile row, every readiness state including bounds tightened after save and settings unset.
6. `PUT /api/mentors/me/prices`; route tests for 200, 400 with both `fieldErrors`, 401, 403 (mentee, operator-only), 404 no profile, missing CSRF, 503.
7. `CrudForm` `inputMode`/`suffix` props with component tests; `/mentor/prices` (incl. fail-closed state); "Set your prices" and the named out-of-bounds price on `/mentor`; prices or "Not bookable yet" on `/m/[slug]`; component tests incl. the absent booking action.
8. Integration test: accepted mentor with a published page (and a bookable slot once #25 has merged) sets prices inside bounds → `/m/<slug>` signed out shows both; an out-of-bounds save shows the range and leaves the page unchanged; a published mentor without prices shows "Not bookable yet" and no booking action.
Each step ends with `npm run validate` green at 100% coverage; step 8 runs `npm run test:integration`.
