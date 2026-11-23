# Security fix plan

**Source:** `docs/security/threat-model.md` (2026-11-23). **Scope:** every High-impact threat and every threat whose control is None or Partial. Paths are relative to `packages/core/src/` unless they start with `packages/`.

**T-06** is fixed (403 for an operator resolving a report on their own booking, `services/bookings/booking-report.service.ts:126-128`, covered by `report-own-booking-resolve.test.ts`); skipped here.

| ID | Confirmed in code | What is missing | Proposed smallest fix | Test |
| --- | --- | --- | --- | --- |
| T-01 | No (control holds) | Every query keys by `id` + `mentee` (`booking.service.ts:183, 215`; `booking-report.service.ts:54`). Integration already covers GET (`booking-checkout.test.ts:142`), `/cancel` (`booking-cancellation.test.ts:145`), `/report` (`:202`); only `/release` lacks a cross-account check | No code change; add one assertion | Integration: mentee B on A's `POST /release` → 404, A's hold unchanged |
| T-02 | Partly (control holds, test gap) | `partyWhere` is the only access path (`services/sessions/session.service.ts:69-75, 222`; `session-note.service.ts:227`). Integration uses a stranger mentee only (`text-session.test.ts:132-133`, `session-note.test.ts:127`) | No code change; add mentor B and an operator to the existing suites | Integration: mentor B and operator on GET session, POST messages, GET note → 404 |
| T-04 | No (control holds) | Slot removal filters by the caller's profile (`services/availability/slot.service.ts:182`) and is tested (`availability-slots.test.ts:203-209`). Connect uses only the session user's profile (`services/payments/connect.service.ts:142-143`), not covered by a two-mentor test | No code change; one assertion | Integration: mentor A's `/connect/start` leaves B's Connect row untouched |
| T-05 | Partly (control holds, test gap) | `requireRole` is on every admin handler (`http/payouts.ts:29, 39`; `http/bookings.ts:76-77`); operator needs a verified email (`services/auth/account.service.ts:105`). Tested: refund retry, payout release, connect start (`mentor-payouts.test.ts:160-162`). Untested: report resolve by non-operator, unverified allowlisted email | No code change; extend tests | Integration: mentee and mentor-only on `/api/admin/reports/{id}/resolve` → 403; unverified allowlisted account has no `operator` |
| T-07 | Yes | `releaseDue` pays every confirmed booking 24 h after its end unless an open report exists (`services/payments/payout.service.ts:80-85, 122-124`); no check for a `SessionAnswer`. `HOLD_REASONS` has no such reason (`packages/db/src/entities/payments/payout.entity.ts:14`) | In `settle`, hold with a new reason `no_answer` when the booking has no `SessionAnswer`; the operator sees it on `/admin` (needs a product decision, see below) | Unit: confirmed booking past 24 h without an answer → held `no_answer`; integration on `/api/admin/payouts/release` |
| T-08 | Yes (narrow) | Amount, currency, slot and overlap are checked, but `booking.checkoutSessionId ??= session.id` (`services/bookings/booking.service.ts:287`) does not compare an already stored id | Add `(booking.checkoutSessionId == null \|\| booking.checkoutSessionId === session.id)` to `matches`; mismatch → `payment_orphaned` | Unit: completion with a different session id → orphaned, not confirmed |
| T-10 | No (control holds) | Row lock, transfer lookup before create, destination from the booking's own profile (`payout.service.ts:150-187`). Integration checks a sequential repeat only (`mentor-payouts.test.ts:116`) | No code change; add a parallel case | Integration: two parallel releases → one transfer to the booking mentor's account |
| T-11 | Yes | One hold per mentee and per-email limits only (`http/bookings.ts:28`); per-IP limits skipped with 0 hops (`security/rate-limit.ts:79-95`); no cap of concurrent holds per mentor | Set `TRUSTED_PROXY_HOPS` in production (T-12 fix); cap concurrent holds per mentor only if abuse is seen | Manual, two accounts: second cannot book the held time; re-check limits with production hops |
| T-12 | Yes | `TRUSTED_PROXY_HOPS` defaults to 0 (`config/env.ts:112`), so per-IP sign-in limits are off (`security/rate-limit.ts:84-95`); only a log warning | Fail env parsing when `NODE_ENV=production` and hops = 0; set the real value on the host | Unit (`env.test.ts`): production + 0 hops → error; `rate-limit.test.ts` run with hops > 0 |
| T-13 | Yes | CSRF header (`http/apiHandler.ts:86-90`) and cookie flags hold; `packages/app/next.config.ts:25-36` sets no CSP, `frame-ancestors` or HSTS, and nothing else in `packages/` does | Add a global `headers()` entry: `Content-Security-Policy: frame-ancestors 'none'` (+ `X-Frame-Options: DENY`), HSTS if the host does not set it; a full script CSP later | DAST: POST without the CSRF header → 403; headers present on `/`, `/bookings/*`, `/admin` |
| T-14 | Yes | `resolve` stores only `resolvedAt` (`booking-report.service.ts:130-131`); `releasePayouts` and `retryBookingRefund` drop the session user (`http/payouts.ts:29`, `http/bookings.ts:76-79`) | Pass the operator id to the three services and log `{ operatorId, target }` on each action; add `resolved_by` to `booking_reports` (migration) | Log review after an integration run: each admin action carries the operator id; unit on the log call |

## Work order (value per effort)

1. **T-08** session id comparison: one condition + one unit test. *Agent.*
2. **T-12** refuse to boot in production with 0 hops. *Agent* for the env check; **owner** sets the real hop count (hosting).
3. **T-13** `frame-ancestors 'none'` + `X-Frame-Options` in `next.config.ts`. *Agent*; **owner** confirms which headers the host already adds (HSTS, CSP).
4. **T-14** operator id in logs, then `resolved_by` column. *Agent* (migration reviewed by owner as usual).
5. **T-05, T-01, T-02, T-04, T-10** missing integration assertions in existing suites. *Agent*; owner runs the touched integration files locally before push.
6. **T-07** hold payouts without a written answer. **Owner** decides the product rule (open question in the threat model), then *agent* implements.
7. **T-11** per-mentor hold cap. **Owner** decides after T-12 is live and abuse is observed.

## Proposed to accept

- **T-11 (beyond the hop fix):** a hold lasts about 36 min, one hold per account, mentors are invitation-only and few; per-IP limits after T-12 remove the cheap case. A per-mentor cap risks refusing real mentees. Revisit on the first report of blocked slots.
- **T-07 (if the owner keeps the spec rule):** the payouts spec treats the closed answer window plus the 24 h report window as enough; mentors are invited and known, and operators can still refuse future payouts. Accept only with an explicit owner decision recorded in the spec.
- **T-13 full script CSP:** framing protection covers clickjacking now; a nonce-based CSP with Next.js `cacheComponents` is a larger change with low added value while React escapes output and no user HTML is rendered.

## Status (2026-11-23)

- Done: **T-08** (stored session id compared, unit RED → GREEN), **T-14** partly (operator id logged on refund retry, report resolve and payout release; `resolved_by` column still open), **T-07** accepted (D27).
- Integration assertions added: **T-01** `/release` by another mentee (`booking-checkout.test.ts`), **T-02** another mentor and an operator on session, messages and note (`text-session.test.ts`), **T-05** mentee and mentor-only on report resolve (`report-own-booking-resolve.test.ts`).
- Open: T-12 and T-13 (need hosting facts from the owner), `resolved_by`, T-04 Connect two-mentor check, T-10 parallel release.
