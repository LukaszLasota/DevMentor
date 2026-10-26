# Sign in with GitHub, email and password as fallback

Status: approved
Issue: #21 (E01-S01) · Epic: #16 · Source: `.ai/specs/product-brief.md` (R11, D12) · Primitives: `.ai/specs/2026-10-21-platform-primitives.md` · Follows the course reference spec `2026-09-04-accounts-and-roles.md` (lesson 05), adapted to this repository
Prototypes: `prototypes/konta-i-role/` (clickable, Epic 01; local lesson-07 work, not in git) · `.ai/prototypes/discovery/mentor-onboarding/revision-001/` (grey, mentor onboarding) · Screen map: `lekcja-07/mapa-ekranow.md` (s01–s10, approved 2026-10-23; local)

## 📝 TLDR
Every DevMentor role (mentee, mentor, operator) needs an account before anything else in the backlog works; today the app has no users, sessions or `auth.ts`. Proposed: a person signs in with GitHub, or registers with an email and sets a password from the link mailed to it, and gets a 24-hour session cookie that every later route checks live. Every new account holds the mentee role; the mentor role is added only by an accepted invitation (#22); operator authority comes only from the `OPERATOR_EMAILS` allowlist. Roles combine freely.

## 📝 Problem Statement
No 1.0 feature can run without knowing who the user is: invitations (#22), mentor pages (#23), booking and payment (#29) all need a signed-in user and a role. The brief decides GitHub for every role with email and password as fallback (R11, D12, founder A). One developer named account friction as a reason to give up: "nie że zakładam konto, weryfikacja maila, potem czekam" (research/2026-09-01-interview-backend-dev-fintech.md) — so GitHub is the primary, one-click path and email verification never blocks GitHub users.

## 📝 Proposed Solution
Hand-written GitHub OAuth (authorization code flow with `state` and PKCE, `fetchJson`) plus email/password, both ending in the same session primitive (`jose` JWT with `sv` in an httpOnly cookie, checked against the database on every request). Alternatives considered: an auth library (rejected in the primitives spec); keeping one account per sign-in method (rejected: one person would hold two mentee accounts with split bookings); operator stored as the authority and reconciled only at sign-in (rejected, as in the course: granting would need a sign-out cycle). Resolved with the session owner on 2026-10-21, following the course's lesson-05 walkthrough: two specs (primitives + this feature), build only what Epic 01 needs, role name `mentee`, email verification in scope, password reset out of scope, accounts linked only on a GitHub-verified primary email.

## 📝 Architecture
- `packages/db/src/entities/auth/user.entity.ts`, `email-verification-token.entity.ts`, `auth-rate-limit.entity.ts` — registered in `entities/index.ts`; one migration per phase (`up` and `down`).
- `packages/core/src/services/auth/github-oauth.service.ts` — builds the authorize URL (forwards GitHub's `login` hint), exchanges the code, reads `/user` and `/user/emails` through `fetchJson` with `GITHUB_OAUTH_URL` / `GITHUB_API_URL`.
- `packages/core/src/services/auth/account.service.ts` — find-or-create by GitHub id, link by verified email, operator reconciliation, start registration, set the password from a verification link, verify password, sign-out (bump `session_version`). `users.email` is never updated after creation.
- `packages/core/src/validators/auth/{register,set-password,sign-in}.schema.ts` — shared with the forms through the new `@devmentor/core/validators` entry.
- `packages/app/src/app/api/auth/**/route.ts` — thin `apiHandler` routes; the GitHub start and callback routes use `redirectHandler` (see API). No `export const dynamic`.
- `packages/app/src/lib/session.ts` — page guards (`requirePageSession`, `requirePageRole`, `homeFor`) over the core session operation.
- `packages/app/src/app/(auth)/` — new route group with its own root layout, using `@devmentor/ui` (shadcn) as agreed in the course: `sign-in/page.tsx`, `register/page.tsx`, `verify-email/page.tsx`.
- `packages/app/src/app/(admin)/` — layout and every page call `requirePageRole('operator')`.
Services are registered in `container.ts` + `cradle.ts` as `scoped`; `GithubOAuthService` and the Resend mailer receive `fetchJson` so tests stub upstreams.

## 📝 Data Model
`users`
| Field | Type | Notes |
|---|---|---|
| id | uuid pk | |
| email | text, unique, not null | stored lower-cased; never updated after creation (it is the operator allowlist key) |
| roles | text[], default `{mentee}` | `CHECK`: not empty, no null members, members only `mentee` \| `mentor` \| `operator`; any combination allowed; duplicates normalized by `AccountService`. `operator` here is a cache of `OPERATOR_EMAILS`, not the authority |
| session_version | integer, not null, default 0 | carried as `sv` in the token; bumped by sign-out, password change, `grantRole` / `revokeRole` |
| github_id | bigint, unique, nullable | stable id; login can change |
| github_login, avatar_url | text, nullable | refreshed on each GitHub sign-in |
| password_hash | text, nullable | `scrypt` (primitives spec); set only from a verification link, so only the mailbox owner ever chooses it; null for GitHub-only accounts |
| email_verified_at | timestamptz, nullable | set by GitHub (verified primary email) or by the verification link |
| created_at, updated_at | timestamptz | |

`email_verification_tokens`: `id`, `user_id` fk (cascade), `token_hash` unique, `expires_at` (24 h), `used_at` nullable. Only the SHA-256 hash is stored; single-use, because using it sets a password.
`auth_rate_limits`: owned by the primitives spec (rate limiter).
No personal data beyond email, GitHub login and avatar URL; passwords, tokens and `session_version` never in a DTO or log (logger redaction, standards §1).

## 📝 API Contracts
| Route | Behavior |
|---|---|
| `GET /api/auth/github?returnTo=&login=` | GitHub credentials or `SESSION_SECRET` missing → 302 `/sign-in?error=github_unavailable`. Else sets short-lived `dm_oauth` cookie (`jose` JWT, `aud: 'oauth-state'`, carrying state, PKCE verifier, safe returnTo; 10 min, HttpOnly, `SameSite=Lax` so the callback receives it), 302 to GitHub with scope `read:user user:email` and a validated `login` hint (`[A-Za-z0-9-]{1,39}`) |
| `GET /api/auth/github/callback?code&state` | `?state` must equal the cookie's state claim and the cookie must verify, before any outbound call; exchanges the code, resolves the account (below), reconciles operator, sets `dm_session`, clears `dm_oauth`, 302 to `safeReturnTo(returnTo, homeFor(roles))`; any failure → 302 `/sign-in?error=<code>`. Both GitHub routes use `redirectHandler` (no envelope, no CSRF header, no route-level try/catch) |
| `POST /api/auth/register` `{ email }` | always 202 `{ status: 'check-inbox' }` (no account enumeration): a new email gets an unverified mentee without a password and a link to set one; an existing email gets a "someone tried to register" mail; nothing else changes; rate limited; mail delivery failure → 503 |
| `POST /api/auth/sign-in` `{ email, password }` | 200 `{ user }` + `dm_session`; wrong email or password, or no password set → 401 `UNAUTHORIZED` "Invalid email or password."; rate limited |
| `POST /api/auth/verify-email` `{ token, password }` | sets the password, marks the email verified, consumes the token, bumps `session_version` (password change) and issues a fresh `dm_session`; invalid/expired/used token → 400 |
| `POST /api/auth/verify-email/resend` `{ email }` | always 202; sends a new link only to an existing account that has no password yet; rate limited |
| `POST /api/auth/sign-out` | CSRF header only, never a valid session: with a live session bumps `session_version` (global logout, every device); always clears `dm_session`; 200 |
| `GET /api/auth/me` | `{ user }` or 401 |
`user` = `{ id, email, roles, githubLogin, avatarUrl, emailVerified }`. Password: 12–128 characters, no other composition rules. POST routes keep `apiHandler`'s central CSRF check.

GitHub account resolution: (1) a user with this `github_id` → sign in, refresh login/avatar; (2) else a user whose email equals GitHub's **verified primary** email and whose `github_id` is null → link `github_id`, set `email_verified_at`, sign in (a pending registration without a password is completed this way too: it holds no password anyone could know); (3) a matching email that already has a different `github_id` → `/sign-in?error=github_account_conflict`, nothing changed; (4) else create a mentee with that email, verified. If GitHub returns no verified primary email → `/sign-in?error=github_email_unverified`. `users.email` is never rewritten.

Session check (every route via `requireSession`, every page via `requirePageSession`): verify the token (`aud: 'session'`, current or previous secret) → load the user → 401 when missing or `session_version ≠ sv` → `operator` effective iff the verified email is in `OPERATOR_EMAILS` → when the stored set disagrees, reconcile it (idempotent, keeps other roles, emits `auth.user.roles_changed`, no `session_version` bump).

Why the password is set from the link: if registration accepted a password, someone could register another person's email with a password they know, and the owner's later verification or GitHub link would hand them the account. Setting the password from the mailbox link means only the mailbox owner ever knows it.

## 📝 UI/UX
- `/sign-in`: "Continue with GitHub" as the primary button; below it the email/password form (`CrudForm`, `sign-in.schema`); link to `/register`. `?error=` codes map to plain messages.
- `/register`: email field only; after submit, "Check your inbox to finish registration" with a resend action.
- `/verify-email#token=`: the token travels in the URL fragment (never sent to servers or in `Referer`); the page asks for the new password, posts both, signs in; expired or used links show a resend action. `Referrer-Policy: no-referrer`.
- Guards: every guarded layout and every guarded `page.tsx` calls `requirePageRole`; no session → `/sign-in?returnTo=<current>`; wrong role → `homeFor(roles)` (`operator → /admin`, `mentor → /mentor`, else `/mentors`) with a short message (L03). Nothing of the user's renders before the check.
- States: submitting (button disabled), field errors from `fieldErrors`, 429 message with retry time, GitHub cancelled.

## 📝 Edge Cases & Failure Scenarios
- User cancels on GitHub → callback with `error=access_denied` → `/sign-in?error=github_cancelled`.
- `state` missing or mismatched (CSRF on the callback, expired `dm_oauth`) → refuse before any outbound call, no account touched.
- GitHub down, slow or token exchange fails → `fetchJson` 10 s timeout / 503 → `/sign-in?error=github_unavailable`; logged without the code or token.
- GitHub login renamed → matched by `github_id`, login refreshed. GitHub primary email changed → nothing changes; `users.email` is not rewritten, so operator authority is unaffected.
- GitHub verified email already used by a password account → linked (rule 2); an unverified GitHub email never links.
- Register with an email that exists → the same 202 as a new email; the owner receives a "someone tried to register" mail; no account is changed.
- Sign-in on a GitHub-only account with a password → generic 401.
- Concurrent first GitHub sign-ins → unique `github_id` / `email`; the loser retries the lookup and signs in.
- Verification link used twice, expired, or for another account → 400 with resend option.
- Token for a deleted user, or with an old `sv` (signed out elsewhere, copied cookie) → 401; the page treats the user as signed out.
- Sign-out with an expired or tampered cookie → succeeds, cookie cleared, no bump.
- Operator removed from `OPERATOR_EMAILS` → `/admin` refused on the next request (layout and page both check); added → works on the next request.
- Stored roles empty despite the `CHECK` → 500 logged, never a 401 loop.
- Rate limit hit → 429 with `Retry-After`; hashing gate saturated → 503, not counted; GitHub path is not rate limited by us.
- Mail delivery fails → register/resend 503; no success reported without delivery.
- `returnTo` off-site, `//x`, `/api/…`, `/_next/…` → replaced by the fallback.
- Forgotten password → no recovery path in this spec; accepted until the password-reset story (out of scope). GitHub users are unaffected.
- Email matching uses lower-casing only; no alias or dot stripping, so `a+x@` and `a@` are different accounts.
- Pages that read the session cookie run at request time under `cacheComponents`: the reading component sits inside `<Suspense>`, and `npm run build` with no database must still pass.

## 📝 Risks & Impact Review
- New tables via new migrations (additive, `up` and `down`). Role values are a contract other stories read (#22, #26): adding a value later is additive, renaming is not.
- `/admin` becomes operator-only (it is public today): `browser.test.ts` signs in through the GitHub stub as the CI operator (`mock-operator@devmentor.test`) in the same PR.
- New env vars (primitives spec): `.env.example`, CI and the setup script change together; integration tests run against a local GitHub stub that derives a persona from the `login` hint (`<login>@devmentor.test`).
- Linking by email trusts GitHub's verified flag; accepted risk, documented.
- Every signed-in user has a verified email (GitHub verified primary, or the verification link), so later stories and the operator check can rely on it.
- `risk-high` (auth, sessions, migrations): second reviewer and `needs-qa`.

## 📝 Decisions in play
- R11 / D12 — GitHub sign-in for every role, email fallback (founder A).
- R13 — no open mentor registration: register always creates a mentee (founder A with founder B).
- R16 — the founders are the operator: `OPERATOR_EMAILS`, the allowlist commit is the audit record (founders A and B).
- Engineering standards §1 — token, cookie, CSRF, rate limiting, generic auth errors; hashing bullet amended (phase 2).

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
- `AGENTS.md` is amended in phase 1: `(auth)`, `(mentee)` and `(mentor)` use shadcn via `@devmentor/ui`; `(marketing)` stays Tailwind only; the persona group is `(mentee)`, not `(student)`.
- GitHub OAuth App (scope `read:user user:email`), one for localhost and one for production, registered by founder B; secrets only in `.env` and the deploy environment.
- Sessions last 24 h with no refresh.
- Avatars are shown straight from GitHub's URL with a plain `<img>`.
- A mentor keeps the mentee role (`{mentee, mentor}`) and can book other mentors.
- A signed-in user opening `/sign-in` or `/register` is redirected to `safeReturnTo(returnTo, homeFor(roles))`.
- Without `returnTo`, sign-in lands on `homeFor(roles)`; mentees land on `/mentors` (#27). Superseded 2026-10-23 by screen-map decision L01 (was: `/` until the mentee home exists).
- Account deletion and data export (GDPR) are out of scope for #21; a known limitation for founder A before release, next to the brief's Q06 (terms of service).

Adopted from the course reference spec on 2026-10-21:
- Any non-empty combination of `mentee`, `mentor`, `operator`; no constraint against `mentor` + `operator`; duplicates normalized by the application.
- Operator authority derived live from `OPERATOR_EMAILS` against the verified email; the stored role is a cache reconciled idempotently (replaces "operator added by hand in SQL"); the reviewed allowlist commit is the R16 audit record.
- `session_version` as `sv` in the token; triggers: sign-out (global logout, every device), password change, `grantRole` / `revokeRole`; a role change re-issues the caller's cookie in the same route response (replaces "no server-side revocation").
- PostgreSQL rate limiter, Resend over HTTP (closes Q01; dev/test via the course's log mailer read from the app log, replacing our outbox), `SESSION_SECRET_PREVIOUS`, `fetchJson` 10 s → 503, env tiers, boot refusal for override URLs without `ALLOW_TEST_OVERRIDES`, guards on every page with `requirePageRole` / `homeFor`, sign-out with CSRF only, JWT `aud`, `safeReturnTo` rejecting `/api/` and `/_next/`, `users.email` never updated.
- `scrypt` (node:crypto) behind a concurrency gate instead of `bcryptjs`; the bcrypt bullet of `.ai/specs/2026-09-01-engineering-standards.md` is amended in the same PR (phase 2 step 2).
- Release scope: both phases ship by 2026-10-31 (replaces "phase 2 ships after Q01").

Deliberate differences from the course:
- (a) No `export const dynamic` on auth routes: removed under Next 16 `cacheComponents` and forbidden by `AGENTS.md`; request-time rendering comes from reading cookies and the database.
- (b) Registration takes only the email, the password is set from the mailed link, and register always answers 202. The course's password at registration and 409 for a GitHub-tied email would leak account existence and let someone pre-register another person's email with a known password (pre-registration takeover). Consequence: no row ever has a password before verification, so a GitHub-verified email may complete a pending registration (rule 2), and register is rate limited per email too.

## ✅ Acceptance criteria
Moved from issue #21 and extended with the screen-map decisions of 2026-10-23 (L01–L14) and the prototype review comment of 2026-10-26. Screen ids from `lekcja-07/mapa-ekranow.md`.
- (s01, s02) Given a visitor, when they choose "Continue with GitHub" and approve, then they are signed in and their account is created on the first sign-in.
- (s03, s04) Given a visitor without GitHub, when they register with their email, open the mailed link and set a password, then they are signed in and can later sign in with that email and password (issue criterion 2, reworded to the spec's flow, L10).
- (s01) Given a wrong email or password, when they sign in, then they see "Invalid email or password." and nothing reveals whether the account exists.
- (s10) Given a signed-in user, when they sign out, then every device is signed out and protected pages refuse them until they sign in again.
- (s05) Given a user who holds only `mentee`, when they sign in without `returnTo`, then they land on `/mentors` (L01).
- (s04) Given a registration started from a page with `returnTo` (e.g. an invitation), when the password is set from the link, then the user lands on that page, otherwise on `homeFor(roles)` (L02).
- (s01, s09) Given an expired session, when the user is sent to `/sign-in`, then it says "Your session ended. Sign in again."; given a signed-in user without the role, when they open a role page, then the page they land on says "This page is for mentors." (or operators) (L03).
- (s05, s06, s07) Given a signed-in user, then every signed-in page shows their email (GitHub avatar when present) and "Sign out"; a user with `mentor` and `operator` sees "Mentor" and "Admin" links (L04, L09).
- (s04) Given the set-password page, then it has one password field with "Show password" (L05).
- (s03) Given the mail provider fails, when the user registers or resends, then they see "We could not send the email. Try again later, or continue with GitHub." (L06).
- (s01) Given the sign-in page, then it says "Forgot your password? Use GitHub with the same email." (L12).
- (s04) Given a session of another account, when a verification link is opened, then it shows "link not valid" and changes nothing (L13).
- (s03) Given "Check your inbox", when the user chooses "Use a different email", then the form returns with the typed address ready to correct (prototype review comment, 2026-10-26).

Not doing: no invitation list on `/admin` in 1.0; invitations stay in `npm run invite -- list` (L08, R16).

## ❓ Questions from the synthetic walkthrough (2026-10-26)
Hypotheses from a synthetic persona panel (`.ai/specs/research/walkthroughs/2026-10-26-mentor-onboarding-session-001/report.md`), `[SYNTHETIC]`: questions to check with real mentors, not requirements.
- (s05, s06) Does the "mentee" label next to the email confuse invited mentors who never asked for it? Check: think-aloud on the account bar with 3–5 invited mentors.

## 📋 Phasing
- Phase 1 — GitHub sign-in, the session layer and the operator guard (independently shippable: GitHub users can sign in and out; `/admin` is operator-only).
- Phase 2 — Email and password with verification (one deployable unit: password accounts never ship without verification).
Both phases ship by 2026-10-31.

## 📋 Implementation Plan
**Phase 1 — GitHub sign-in**
1. Env tiers in `env.ts` (`SESSION_SECRET`, `SESSION_SECRET_PREVIOUS`, `APP_URL`, `GITHUB_*`, `OPERATOR_EMAILS`, `ALLOW_TEST_OVERRIDES`) incl. the boot refusal for override URLs without `ALLOW_TEST_OVERRIDES` and the production check at container creation; `.env.example` (dev values), `ci.yml` job env (test values, stub URLs, CI operator address), the setup script and existing test fixtures; logger redaction for `password`, `token`, `code`, `cookie`, `authorization`; tests for every tier and redaction.
2. Primitives (adds `jose` to `core`): Clock, secure token, session token (`sv`, `aud`, previous secret), session cookie, response cookies in `apiHandler`, `redirectHandler`, `safeReturnTo` (incl. `/api/`, `/_next/`), `fetchJson`, typed event emitter with `auth.user.roles_changed`; unit tests.
3. `User` entity + migration (all columns above, the roles `CHECK`, `up` and `down`); spike `text[]` with MikroORM 7 first; entity and constraint tests.
4. `GithubOAuthService` over `fetchJson` with the `login` hint; unit tests for success, no verified email, GitHub errors and timeout.
5. `AccountService.resolveGithubAccount` (rules 1–4), operator reconciliation and role normalization, `signOut` (bump); unit tests incl. concurrent create (unique violation handled by re-reading), conflict on a different `github_id`, completing a pending registration, allowlist add/remove, duplicate roles, email never rewritten.
6. `auth.ts` guards, `getSessionUser`, `app/src/lib/session.ts` (`requirePageSession`, `requirePageRole`, `homeFor`); unit tests for missing, tampered, wrong `aud`, expired, old `sv`, previous secret, unknown user, empty roles, live operator.
7. Routes `github`, `github/callback`, `sign-out`, `me`; route tests incl. state checked before any outbound call, sign-out without a valid session, global logout.
8. `(auth)` layout (session read inside `<Suspense>`) and `/sign-in` with the GitHub button and error messages; `(admin)` layout and pages guarded; `AGENTS.md` updated in the same PR for the shadcn route groups and the `(mentee)` name; component tests; GitHub stub with `login` personas; integration tests: sign in → `/api/auth/me` → sign out → old cookie refused; `/admin` as the CI operator, refused for a mentee; `npm run build` with no database.
**Phase 2 — Email and password with verification** (ships as one unit)
1. `@devmentor/core/validators` entry (`packages/core/src/validators/auth/`, `exports` in `package.json`) with `register`, `set-password` and `sign-in` schemas; tests.
2. Password hashing (`scrypt` + concurrency gate), `TooManyRequestsError` with `headers` / `retryAfterSeconds` (mirrored in `ui` types), `AuthRateLimit` entity + migration and the rate limiter (`TRUSTED_PROXY_HOPS`, `PASSWORD_HASH_*` env); amend the bcrypt bullet of `.ai/specs/2026-09-01-engineering-standards.md` in this PR; unit tests incl. gate saturation not consuming the limit and the upsert against a real database.
3. `EmailVerificationToken` entity + migration; `MailSender` with the `resend` adapter (over `fetchJson`) and the `log` adapter; `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` env with the production and boot checks; unit tests.
4. `AccountService.startRegistration` (always 202, mails for new and existing emails), `setPasswordFromLink` (bumps `session_version`), `verifyPassword` (dummy-hash timing path, refuses accounts without a password), `resend`; unit tests incl. a second registration of the same email and a GitHub sign-in on a pending registration.
5. Routes `register`, `sign-in`, `verify-email`, `verify-email/resend`; route tests incl. 401 without a password, 429 with `Retry-After`, 503 on mail failure, existing email, expired/reused/foreign token, cookie re-issued with the new `sv`.
6. `/register`, the email form on `/sign-in`, `/verify-email`; component tests; integration harness writes the app log to a file and gains `waitForMail(to)`; integration test register → read the link from the log mailer → set the password and signed in → sign out → sign in.
Each step ends with `npm run validate` green (100% coverage); each phase also runs `npm run test:integration`.
