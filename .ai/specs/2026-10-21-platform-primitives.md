# Platform primitives for the 1.0 backlog

Status: approved
Source: `.ai/specs/product-brief.md`, `.ai/specs/backlog.md` (#16–#32) · First consumer: `.ai/specs/2026-10-21-sign-in-github-and-email.md` (#21) · Follows the course reference spec `2026-09-04-platform-primitives.md` (lesson 05), adapted to this repository

## 📝 TLDR
Every 1.0 story after #21 needs to know who is signed in and what roles they hold, and none of the building blocks exist yet (`AGENTS.md` names `auth.ts` as arriving "with the auth concept"). Proposed: design and build each primitive only when the first story needs it, here for Epic 01's sign-in (#21); later stories extend this catalog in their own specs instead of reinventing it. This spec owns the contracts; feature specs own the build steps.

## 📝 Problem Statement
Without a shared design, each story would re-invent session parsing, role checks or time handling slightly differently — exactly what the engineering standards' "Reusable API & UI Layer" forbids (`.ai/specs/2026-09-01-engineering-standards.md` §1). The backlog shows the overlap: every story after #21 calls `requireSession`, and the operator and mentor stories (#22, #24) call `requireRole`.

## 📝 Proposed Solution
A catalog of small primitives in `packages/core` (server), `packages/core/validators` (client-safe) and one page-guard module in `packages/app`, each with one home, one contract and a named first consumer. Alternative considered: a full auth/session library (Auth.js, better-auth). Rejected because the standards already fix hashing, token, cookie, CSRF and rate-limit rules, the container owns lifetimes, and a library would bring its own adapter, schema and route conventions next to MikroORM and Awilix — an architectural alternative `AGENTS.md` requires approval for. Course decision (lesson 05, after review): primitives are designed and built only when a story uses them; time rules for slots (R09, R10) and the booking transaction (#29) are designed in their own specs.

## 📝 Architecture

| Primitive | Home | Contract (summary) | Built in | Used by |
|---|---|---|---|---|
| Clock | `core/src/time/clock.ts` | `Clock { now(): Date }`; `systemClock` singleton in the container; tests inject a fixed clock; reaches `jose` as `currentDate` | #21 (token and link expiry) | #21 |
| Secure token | `core/src/security/token.ts` | `randomToken(bytes = 32): string` (base64url, `node:crypto`), `hashToken(token): string` (SHA-256 hex) — store only hashes | #21 | #21 (email verification), #22 (invitations) |
| Session token | `core/src/security/session-token.ts` | `signSession({ sub, sv }, secret, clock)` / `verifySession(token, secrets, clock)` over `jose` (HS256 only, `algorithms: ['HS256']`); claims `sub` (user id), `sv` (session version), `aud: 'session'`, `iat`, `exp` (24 h); no roles in the token. Signs with `SESSION_SECRET`; verifies with `SESSION_SECRET`, then `SESSION_SECRET_PREVIOUS` (verify only). Every JWT in the codebase carries an `aud` and every verifier names the one it accepts (the OAuth state cookie is `aud: 'oauth-state'`). Any failure → `null`. Pure, no database | #21 | every signed-in route |
| Session cookie | `core/src/http/session-cookie.ts` | `SESSION_COOKIE = 'dm_session'`; `readSessionCookie(req)`; `sessionCookie(token)` / `clearSessionCookie()` return `Set-Cookie` strings: `HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`, `Secure` when `NODE_ENV=production` | #21 | every signed-in route |
| Session version | `users.session_version` (sign-in spec) + `requireSession` | revokes every session of a user at once. Closed list of triggers, all in route handlers: sign-out (global logout), password change, `grantRole` / `revokeRole`. A route that bumps it for the caller re-issues the caller's cookie in the same response. Operator reconciliation never bumps it (a page render cannot set a cookie) | #21 (sign-out, password) | #22 (`grantRole`) |
| Response cookies | `core/src/http/apiHandler.ts` (additive) | a handler may return `withCookies(data, cookies[])`; `apiHandler` adds each as a `Set-Cookie` header and still sends the `{ ok: true, data }` envelope. Existing handlers are unchanged | #21 | sign-in, sign-out, verify-email, invitation accept |
| Redirect handler | `core/src/http/redirectHandler.ts` | `redirectHandler(handler, { errorRedirect })`: request scope like `apiHandler`, no envelope and no CSRF header (top-level browser GET); the handler returns `{ location, cookies }`; an `AppError` becomes a 302 to `errorRedirect?error=<code>`, anything else is logged and becomes `error=unexpected`; `location` always passes `safeReturnTo` | #21 | GitHub OAuth start and callback |
| Auth guards | `core/src/http/auth.ts` | `requireSession(req, cradle): Promise<SessionUser>` — verifies the token, loads the user, 401 when absent or `user.session_version ≠ sv`; derives `operator` live (below); returns current roles as a non-empty tuple (a stored empty set is a 500, never a 401). Takes `cradle` because it loads the user, a deliberate extension of the standards' `requireSession(req)`. `requireRole(user, ...roles)` passes when the user holds any listed role, else `ForbiddenError`; errors inside a check deny (fail closed) | #21 | every non-public route |
| Operator allowlist | inside the shared session operation (`core/src/auth/session-user.ts`) | `operator` authority = the row's verified email is in `OPERATOR_EMAILS`, checked on every request in both directions. The stored `operator` membership is a cache, reconciled idempotently at sign-in and on any request where it disagrees; reconciliation keeps other roles, emits `auth.user.roles_changed`, never bumps `session_version` | #21 | every operator check (#21 `/admin`, later operator stories) |
| Page session & guards | `core/src/auth/session-user.ts` (shared operation: `getSessionUser(cookieValue, cradle)`) + `app/src/lib/session.ts` (`next/headers`, `redirect`) | `getPageSession()`, `requirePageSession()` (else redirect `/sign-in?returnTo=<current>`), `requirePageRole(...roles)` (wrong role → `homeFor(roles)`), `homeFor(roles)`: `operator → /admin`, then `mentor → /mentor`, else `/`. Route and page paths run the same live check (token, `sv`, stored roles, allowlist). Called by every guarded layout **and** every guarded `page.tsx` (a layout does not re-run on client navigation) | #21 | `(auth)`, `(mentee)`, `(mentor)`, `(admin)` pages |
| Outbound HTTP | `core/src/http/outbound.ts` | `fetchJson<T>(url, init & { timeoutMs? })`: `AbortSignal.timeout` (default 10 s); timeout, network failure and non-2xx throw `ServiceUnavailableError` (503) with the upstream status in the logged cause; never logs request bodies | #21 | GitHub OAuth, Resend mailer, later Stripe |
| Password hashing | `core/src/security/password.ts` | `hashPassword` / `verifyPassword` with `node:crypto` `scrypt` (N=2¹⁷, r=8, p=1, `maxmem` raised explicitly, named constants), behind a global concurrency gate (`PASSWORD_HASH_CONCURRENCY`, `PASSWORD_HASH_WAIT_MS`; over the wait → 503, not counted by the rate limiter); `verifyPassword` runs against a fixed dummy hash when the user does not exist, so timing does not reveal accounts. No new dependency | #21 (phase 2) | #21 |
| Rate limiter | `core/src/security/rate-limit.ts` + `packages/db/src/entities/auth/auth-rate-limit.entity.ts` | `RateLimiter.consume(key, policy)` (scoped, `{ em, clock }`) throws `TooManyRequestsError`. PostgreSQL fixed window in `auth_rate_limits (key text pk, window_start timestamptz, count int)`, one parameterized upsert (`em.execute`), expired windows deleted on each call; shared by all instances and restarts. Keys `<action>:<email\|ip>:<sha256hex>` (lower-cased email or IP hashed, no PII). Client IP = the `TRUSTED_PROXY_HOPS`-th entry from the right of `x-forwarded-for` (default 0; none derivable → per-IP key skipped, per-email kept, one warning per process). Order: hashing gate slot → consume the limit → hash; every attempt counts, never decremented. Policies are named constants (sign-in 10/15 min per IP + 5/15 min per email; register 5/h per IP + 3/h per email; resend 3/h per email) | #21 (phase 2) | sign-in, register, verification resend |
| Safe return-to | `core/src/http/return-to.ts` | `safeReturnTo(value, fallback)`: accepts only same-origin relative page paths (`/x`; not `//x`, not `/\x`, no scheme, not under `/api/` or `/_next/`) | #21 | sign-in redirects, invitation link |
| Mail sender | `core/src/mail/mail-sender.ts` + `core/src/mail/{resend,log}-mailer.ts` | `MailSender { send({ to, subject, text }) }`. `resend`: Resend's HTTP API (`POST /emails`, bearer `MAIL_API_KEY`, `MAIL_FROM`) through `fetchJson`; delivery failure → 503, never a reported success. `log`: one pino line `mail.sent` with `to`, `subject`, `text` — the development default (boot warning) and the integration-test path (the harness reads the link from the app log, as in the course). Chosen by `MAIL_PROVIDER` | #21 (phase 2) | #21 |
| Event emitter | `core/src/events/` | typed in-process emitter, event ids `concept.entity.action` (`AGENTS.md`); first event `auth.user.roles_changed { userId, roles }` | #21 | #21, #22 |
| Client validators | `@devmentor/core/validators` entry → `packages/core/src/validators/` (new, client-safe, no `server-only`) | shared Zod schemas, starting with the auth forms; `AGENTS.md` already reserves this entry for "the first schema" | #21 (phase 2) | every form |

Takeaway: everything here lands with #21, because the first signed-in route needs it; nothing is designed ahead of a consumer.

## 📝 API Contracts
- New error: `TooManyRequestsError` → code `TOO_MANY_REQUESTS`, HTTP 429, generic message (never reveals whether the email exists). `AppError` gains an optional `headers` field that `apiHandler` copies onto the response (`Retry-After`), and the failure envelope gains an optional `error.retryAfterSeconds`; both additive per `BACKWARD_COMPATIBILITY.md`, mirrored in `ui/src/backend/api/types.ts` in the same PR.
- `apiHandler` response cookies: additive; the envelope shape is unchanged. CSRF stays enforced centrally by `apiHandler` (already in the repo); sign-out needs only the CSRF header, never a valid session.
- Env, validated in `core/src/config/env.ts` and added to `.env.example` and CI together, in three tiers (as in the course):
  - **Optional, checked at the route** (a missing value fails that route closed, never the build or boot): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `MAIL_API_KEY`, `MAIL_FROM`.
  - **Required at first container creation in production** (not in the zod schema, so `npm run build` with no env still passes): `SESSION_SECRET` (when present: at least 64 hex characters = 32 random bytes, `openssl rand -hex 32`), `APP_URL` (absolute URL for OAuth redirect and mail links), and `MAIL_API_KEY` unless `MAIL_PROVIDER=log` is legitimately set. Outside production a missing `SESSION_SECRET` makes auth routes fail closed.
  - **Dangerous configuration fails at boot** (schema refuses): `GITHUB_OAUTH_URL` / `GITHUB_API_URL` set without `ALLOW_TEST_OVERRIDES=1`; `MAIL_PROVIDER=log` with `NODE_ENV=production` without `ALLOW_TEST_OVERRIDES=1`. `ALLOW_TEST_OVERRIDES` is our name for the course's `INTEGRATION_TEST_RUN`; only `ci.yml` and the integration runner set it.
  - Defaulted: `SESSION_SECRET_PREVIOUS` (optional, verify only), `OPERATOR_EMAILS` (comma-separated, normalized; empty = no operator; CI uses `mock-operator@devmentor.test`), `TRUSTED_PROXY_HOPS` (0), `MAIL_PROVIDER` (`resend` | `log`; default `log` in development, `resend` otherwise), `PASSWORD_HASH_CONCURRENCY`, `PASSWORD_HASH_WAIT_MS`, `GITHUB_OAUTH_URL` / `GITHUB_API_URL` (default `https://github.com` / `https://api.github.com`).

## 📝 Edge Cases & Failure Scenarios
- `SESSION_SECRET` missing in production → the first container creation throws and the process does not serve; `npm run build` still succeeds with no env (env is read at request time).
- `SESSION_SECRET` rotated → `SESSION_SECRET_PREVIOUS` keeps live sessions valid for their remaining lifetime; without it the user is signed out (`verifySession` → `null`), never an error page.
- Copied cookie after sign-out → `session_version` was bumped; the copy fails on its next request. Sign-out also ends that user's other devices (one logical session per user; accepted).
- Operator email removed from or added to `OPERATOR_EMAILS` → takes effect on the next request, no sign-out needed; the cache is reconciled, other roles kept.
- Clock skew between instances → expiry is checked with the injected clock only; no client time is trusted.
- Hashing gate saturated → bounded wait, then 503; the rate limit is not consumed.
- GitHub or Resend slow or down → `fetchJson` times out after 10 s → 503 (browser-navigated routes redirect with `error=github_unavailable`); nothing hangs.

## 📝 Risks & Impact Review
- New env vars change `env.ts`, a protected surface: `.env.example`, CI and `npm run setup` (`scripts/lib/setup.mjs` copies `.env.example`) change in the same PR. No variable is required by the schema, so the no-env build job is untouched.
- `jose` is the only new runtime dependency of `core` (standard, audited JWT implementation); unit tests cover tampered signature, `alg: none`/other algorithms, wrong `aud`, expired, malformed tokens and the previous-secret path. Hashing and mail add no dependency.
- New table `auth_rate_limits` via a migration (`up` and `down`); the one entity with a natural text key and no timestamps.
- GitHub stub: overrides are accepted only with `ALLOW_TEST_OVERRIDES=1` and refuse to boot otherwise; missing GitHub config fails closed (`github_unavailable`), never falls back to a fake.
- `@devmentor/core/validators` is a new package entry (additive) and must stay free of `server-only` imports.
- Switching hashing to `scrypt` contradicts the bcrypt bullet of `.ai/specs/2026-09-01-engineering-standards.md`; that bullet is amended in the same PR (sign-in spec, phase 2 step 2).

## 📝 Decisions in play
- R11 / D12 — GitHub sign-in with email fallback (founder A): drives session token, cookie, guards, hashing.
- R16 — the founders are the operator (founders A and B): `OPERATOR_EMAILS` and the live operator check.
- Roles: a user holds any non-empty combination of `mentee`, `mentor`, `operator` (session owner, adopted from the course, 2026-10-21).

## ✅ Resolved with the session owner (2026-10-21)
Adopted from the course reference spec on 2026-10-21:
- Mentor and operator may be held together; duplicate roles are normalized by the application (a Postgres `CHECK` cannot express array uniqueness).
- Operator authority derived live from `OPERATOR_EMAILS` against the verified email; the stored role is a cache reconciled idempotently. The reviewed commit changing the allowlist is the R16 audit record.
- `session_version` in the token as `sv` with the closed trigger list above; role changes re-issue the caller's cookie in the same route response.
- PostgreSQL-backed rate limiter with hashed keys, `TRUSTED_PROXY_HOPS` and the gate → limit → hash order (replaces the in-memory limiter).
- Resend over HTTP as the mail provider (closes Q01). Dev/test path: the course's log mailer, read by the integration harness from the app log (replaces our file outbox).
- `SESSION_SECRET_PREVIOUS` for rotation; `fetchJson` with a 10 s timeout mapped to 503; the three env tiers; boot refusal for override URLs without `ALLOW_TEST_OVERRIDES`; page guards on every page; sign-out needs only CSRF; JWT `aud`; `safeReturnTo` rejects `/api/` and `/_next/`; `scrypt` behind a concurrency gate instead of `bcryptjs`, with the standards bullet amended in the same PR.

Deliberate differences from the course:
- (a) No `export const dynamic` on any route: it is removed under Next 16 `cacheComponents` and forbidden by `AGENTS.md`; uncached DB access already runs at request time.
- (b) Registration takes only the email and the password is set from the mailed link, always answering 202 (sign-in spec). The course's password at registration and 409 for a GitHub-tied email would leak account existence and allow pre-registration takeover.

## 📋 Phasing
No phases of its own. Each primitive is built in the feature spec's phase that first needs it (column "Built in").

## 📋 Implementation Plan
Delivered through the steps of `.ai/specs/2026-10-21-sign-in-github-and-email.md` (its Implementation Plan is the single source of build order; the "Built in" column above only names the story). Each primitive ships with unit tests at 100% coverage in the step that adds it.
