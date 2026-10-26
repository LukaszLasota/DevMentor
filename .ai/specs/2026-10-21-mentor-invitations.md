# Operator invites mentors; only invited people become mentors

Status: approved
Issue: #22 (E01-S02) · Epic: #16 · Source: `.ai/specs/product-brief.md` (R13, R16, D13, D24) · Builds on: `.ai/specs/2026-10-21-sign-in-github-and-email.md`, `.ai/specs/2026-10-21-platform-primitives.md` · Follows the course reference spec `2026-09-08-invitations.md` (lesson 05), adapted to this repository
Prototypes: `prototypes/konta-i-role/` (clickable, Epic 01; local lesson-07 work, not in git) · `.ai/prototypes/discovery/mentor-onboarding/revision-001/` (grey, mentor onboarding) · Screen map: `lekcja-07/mapa-ekranow.md` (s01–s10, approved 2026-10-23; local)

## 📝 TLDR
DevMentor's supply is 50 hand-picked senior engineers invited in batches of 20 (R13, D13); today anyone who signs in is only a mentee and there is no way to become a mentor. Proposed: the operator creates an invitation with a terminal script, sends the printed single-use link by hand, and the invited engineer opens it, signs in with the matching verified email and accepts; their account gains `mentor` without losing any role it already held, the response re-issues their session cookie, and `/mentor` shows the one thing D13 measures: "Publish at least one bookable session by <date>".

## 📝 Problem Statement
R13 makes invitation the only way to become a mentor, and D13 makes the invitation itself the test of A02: at least one bookable session within two weeks of accepting; fewer than 5 of the first 20 stops further invitations. Nothing in the repository represents an invitation or a mentor profile. Until this story ships, no other mentor story (#23–#26) has a mentor to act as.

## 📝 Proposed Solution
A single-use, expiring, revocable link bound to the invited email (the pattern GitHub, Slack and Linear use), created by a by-hand operator script (R16: operator actions without a screen are done by hand and logged). Alternatives considered: an operator screen in `/admin` (rejected: R16 and the course keep operator work by hand in 1.0); mailing the link through Resend (rejected for now, as in the course: the operator sends 20 links by hand and the script output is the audit trail); accepting by link possession alone (rejected: a forwarded link would make a stranger a mentor).

**In scope:** `Invitation` with a normalized email; the raw token only in the link; acceptance that reloads the user, requires a verified normalized email equal to the invitation's, adds `mentor` once inside a transaction, re-issues the caller's session cookie (`grantRole` bumps `session_version`) and creates the empty `MentorProfile` that #23 fills; the first acceptance stores the publish-by deadline; `revoke` and token-rotating `resend` while pending; at most one unresolved invitation per email; the `invite` script (`create | revoke | resend | list`); `/invitation/[token]` and `/mentor`.
**Out of scope:** enforcing batches of 20 and the two-week report (the operator counts from `npm run invite -- list` by hand); the mentor page fields (#23); a mail transport; any operator screen.

Change to the issue: #22's criterion 4 ("the operator views invitations") is met by `npm run invite -- list` (sent / accepted / expired / revoked and the publish-by date); the "has published a slot" column arrives with #25. This is recorded as a comment on #22 when the spec PR opens.

## 📝 Architecture
- `packages/db/src/entities/invitations/invitation.entity.ts`, `packages/db/src/entities/mentors/mentor-profile.entity.ts` — registered in `entities/index.ts`; one migration with `up` and `down`.
- `packages/core/src/services/invitations/invitation.service.ts` — `create`, `lookup`, `accept`, `revoke`, `resend`, `list`; uses the secure-token primitive (`randomToken`, `hashToken`) and the Clock.
- `packages/core/src/services/auth/account.service.ts` — gains `grantRole(em, user, role)`: works on the user entity already locked in the caller's transaction (same `em`), set-based and idempotent (duplicates normalized), keeps every role already held, and bumps `session_version` when the set changes (a trigger on the closed list in the sign-in spec). `revokeRole` is on the same list but is built with its first caller (role removal by hand), not here.
- `packages/core/src/events/` — the typed in-process emitter (built in #21) gains `invitations.invitation.accepted { invitationId, userId, publishDueAt }`, emitted after the transaction commits, never inside it. Kept to follow the course spec: the acceptance is the D13 supply signal later reporting will count; no consumer yet besides tests.
- `packages/app/src/app/api/invitations/[token]/route.ts` (`GET` lookup) and `…/accept/route.ts` (`POST`), via `apiHandler` with `requireSession` on accept; accept returns the re-issued `dm_session` through `withCookies` after the transaction commits. No `export const dynamic`.
- `packages/app/src/app/invitation/[token]/page.tsx` — public, Tailwind, outside the route groups (like a share link).
- `packages/app/src/app/(mentor)/mentor/page.tsx` — new `(mentor)` group (shadcn); the layout and the page each call `requirePageRole('mentor')` (`app/src/lib/session.ts`), then the page reads the profile through `withScope` (no extra API route: nothing on the client needs it).
- `packages/ui/src/time/LocalTime.tsx` — client component: renders the UTC label on the server and first client render, swaps to the viewer's time zone after mount (no hydration mismatch); used inside `<Suspense>`.
- `packages/core/src/cli/invite-cli.ts` — argument parsing, calls to `InvitationService` through `withScope`, and output formatting (unit-tested inside `core`'s 100% gate). `scripts/invite.ts` is a thin entry calling it; the root `invite` npm script runs `tsx --conditions=react-server scripts/invite.ts` so `server-only` resolves to its empty build, and loads the root `.env` (`@next/env`) — the script needs the same env as the app. `tsx` becomes a root devDependency; `scripts/**/*.ts` joins the coverage `include` and the `tooling` test project.

## 📝 Data Model
`invitations` (new)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| email | text not null | normalized (trim, lower-case); partial unique index while unresolved (`accepted_at` and `revoked_at` both null) |
| token_hash | text not null, unique | SHA-256 hex of a 32-byte token; the raw token is only in the link |
| stack_tags | text[] not null | subset of TypeScript, React, Python, AI agents (R16, D24); `CHECK` |
| batch | text null | free text, e.g. `2026-10-a`, until batches get their own story |
| expires_at | timestamptz not null | `created_at + INVITATION_TTL_DAYS` (14), stored, not recomputed |
| accepted_at, accepted_by_id | timestamptz null, uuid null FK `users` | written together; `CHECK ((accepted_at IS NULL) = (accepted_by_id IS NULL))`; `accepted_by_id` deliberately not unique (a removed mentor can be invited again) |
| publish_due_at | timestamptz null | `accepted_at + MENTOR_PUBLISH_WINDOW_DAYS` (14, R13) |
| revoked_at | timestamptz null | |
| created_at, updated_at | timestamptz | |

`mentor_profiles` (new, filled by #23–#26): `id`, `user_id` unique FK, `initial_publish_due_at` timestamptz null (set by the first accepted invitation, never reset), `created_at`, `updated_at`.

The invited email appears only on the invitation page after the token is presented, never in a list outside the operator script.

## 📝 API Contracts
| Route | Auth | Answer |
|---|---|---|
| `GET /api/invitations/[token]` | public | 200 `{ email, stackTags }`; unknown, expired, revoked and used → 404 with one message |
| `POST /api/invitations/[token]/accept` | `requireSession` (no role) | 200 `{ roles, publishDueAt, redirect: '/mentor' }` + a re-issued `dm_session` whose `sv` equals the new `session_version`. Order: token validity first (404, identical for every invalid state), then identity (unverified or email mismatch → 403), so the caller's role never reveals whether a token was once valid |

The invitation page and both routes send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; the logger redacts the token segment of `/invitation/*` and `/api/invitations/*` paths. Brute force needs no rate limiter: the token is 32 random bytes.

Sessions after acceptance, as in the course: `grantRole` bumps `session_version`, so the accept route signs a fresh cookie with the new version after the commit and returns it on its own response. Without it the caller's own action would sign them out and the redirect to `/mentor` would land on `/sign-in`. Roles are never in the token; they are loaded live on every request.

Script: `npm run invite -- create --email <e> --tags <t,...> [--batch <b>] --operator <name>` prints the link once and a token-free audit line for the shared note; `revoke <id>`, `resend <id>` (rotates token and expiry, prints the new link), `list [--batch <b>]`. Env: `INVITATION_TTL_DAYS`, `MENTOR_PUBLISH_WINDOW_DAYS` (both default 14) in `env.ts`, `.env.example`, CI.

## 📝 UI/UX
- `/invitation/[token]`, signed out: the invited address, its stack tags, "Sign in with GitHub" first, the email option second, returning to this URL (`safeReturnTo`).
- Signed in with the matching verified email: whose account gets the role, then "Accept invitation", then `/mentor`.
- Signed in with another email: both addresses, an instruction to sign out and sign in with the invited one, no Accept button.
- Invalid: one sentence, no form.
- `/mentor`: "Publish at least one bookable session by <date>" through `LocalTime`; later stories add the page, prices and slots steps.

## 📝 Edge Cases & Failure Scenarios
- Link used twice, or two tabs accepting at once → one succeeds; the role is granted once (the user row is locked first, then the invitation row).
- Accept racing revoke or resend → the invitation row lock gives one winner; the loser sees the committed state.
- Two `create` commands for the same email → the partial unique index keeps one unresolved invitation; an expired one must be resent or revoked first.
- The email already belongs to a current mentor → `create` refuses.
- A founder (operator) accepts an invitation for their own verified email → holds `operator` and `mentor`; both kept.
- Unverified account (pending email registration, from #21 phase 2) → refused like a mismatch.
- Accept succeeds but the cookie is not re-issued → the caller would be signed out; guarded by a route test and the regression criterion below.
- The GitHub account's verified primary email differs from the invited address (common) → strict rule, as in the course: the page shows both addresses; the operator revokes and creates a new invitation for the address the engineer signs in with.
- Accepted invitations cannot be revoked as a way to remove a mentor; role removal is the separate `revokeRole` operation (also a `session_version` trigger), done by hand later (R16).
- A second accepted invitation for the same person never resets `initial_publish_due_at`.
- Signed-in user with no invitation looks for a "become a mentor" path → none exists; `/mentor` redirects non-mentors to `homeFor(roles)` (layout and page both check).

## ✅ Acceptance criteria
- Given an invitation, when the engineer signs in with the matching verified email and accepts, then the account holds `mentee` and `mentor` and the invitation is accepted with the date.
- Given an accepted invitation, when the mentor lands on `/mentor`, then they see the publish-by date.
- Given a user who already holds `mentee` (or `operator`), when they accept, then they keep it and also hold `mentor`.
- Given a successful acceptance, when the mentor lands on `/mentor`, then they are still signed in — the accept response re-issued their session cookie (regression: `grantRole` bumps `session_version`).
- Given a used link, when it is opened again, then the role is not granted again.
- Given an expired, revoked or unknown link, when it is opened, then no mentor role or profile is created and the page says the invitation is not valid.
- Given a signed-in user with no invitation, then no "become a mentor" path exists anywhere (asserted as absent).
- Given a mismatched or unverified account, when it views or submits, then no Accept button is shown, POST returns 403, and no role, profile, accepted timestamp or new session is created.
- Given two tabs accepting at once, then one succeeds and the role is granted once.
- Given two creates for one email, then one unresolved invitation exists.
- Given an email that belongs to a current mentor, then `create` is refused.
- Given acceptance racing revoke or resend, then one wins and nothing is partially applied.

Added from the screen map (2026-10-23):
- (s08) Given an invitation accepted in another tab, when the page is used again, then it says "You are already a mentor." with a link to `/mentor` (L07).
- (s08) Given a network error on "Accept invitation", then the error shows under the button with "Try again" and nothing changes (L07).
- (s08) Sign in comes first, then "Accept invitation"; the order in issue #22 is corrected to match (L11).
- Not doing: an invitation list on `/admin`; criterion I4 of the issue stays `npm run invite -- list` (L08).

## ❓ Questions from the synthetic walkthrough (2026-10-26)
Hypotheses from a synthetic persona panel (`.ai/specs/research/walkthroughs/2026-10-26-mentor-onboarding-session-001/report.md`), `[SYNTHETIC]`: questions to check with real mentors, not requirements.
- (s08) The strict rule "invited email = GitHub verified email" reads as a dead end to every persona. Check: in the first batch, count invitations whose GitHub primary email differs and the re-invitations the operator made (R16 log).
- (s06) Does "publish at least one bookable session by <date>" read as a quota on a favour? Check: ask decliners of the first batch what influenced them (R13, D13).
- (s06) Do two booking-free weeks end participation? Check: days from publishing to first booking and slot renewals per invited mentor (A02, D13).

## 📝 Risks & Impact Review
`risk-high`: the only self-service role grant in the product, and R13 forbids any other. Needs a second reviewer and `needs-qa`. Compatibility: two new tables (additive, `up` and `down`), a new event, a new `invite` npm script (listed in README), two new defaulted env vars.

## 📝 Decisions in play
R13 / D13 (invite only, batches of 20, two-week publish ask), R16 / D19 (the operator acts by hand; operator authority from `OPERATOR_EMAILS`), D24 (beachhead stack tags), the roles decision in the sign-in spec (any non-empty combination).

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
- Invitation validity 14 days via `INVITATION_TTL_DAYS`, stored per invitation; founder A may change the default before implementation (as in the course spec).
- The `invitations.invitation.accepted` event stays, emitted after commit.
- Strict email match; a different GitHub email means revoke and re-invite.
- Criterion 4 of #22 is recorded as a comment on the issue when the spec PR opens.

Adopted from the course reference spec on 2026-10-21:
- `mentor` and `operator` may be held together: the operator refusal on accept and in `grantRole` is dropped; `grantRole` keeps every held role and normalizes duplicates.
- `grantRole` bumps `session_version`; accept re-issues the caller's cookie in the same response, with the course's "still signed in after accept" regression criterion (replaces "nothing is re-issued").
- Ships by 2026-10-31 with the rest of Epic 01.

Deliberate differences from the course:
- (a) No `export const dynamic` on the invitation routes or pages: removed under Next 16 `cacheComponents` and forbidden by `AGENTS.md`.
- (b) Inherited from the sign-in spec: registration takes only the email, the password is set from the mailed link and register always answers 202; the course's password at registration and 409 for a GitHub-tied email would leak account existence and allow pre-registration takeover. For this story it only means a pending (unverified) account is refused like a mismatch.

## 📋 Phasing
One phase; it ships when #21 phase 1 (GitHub sign-in and `session_version`) is merged, by 2026-10-31.

## 📋 Implementation Plan
1. `Invitation` and `MentorProfile` entities + migration (`up` and `down` exercised), the `CHECK`s and the partial unique index; spike `text[]` with MikroORM 7 first; entity tests.
2. Env vars `INVITATION_TTL_DAYS`, `MENTOR_PUBLISH_WINDOW_DAYS` in `env.ts`, `.env.example`, CI; tests.
3. `invitations.invitation.accepted` added to the event map from #21; unit tests.
4. `AccountService.grantRole`; unit tests for idempotence, duplicate normalization, keeping `mentee` and `operator`, and the `session_version` bump only when the set changes.
5. `InvitationService` (`create`, `lookup`, `accept` in one transaction with user-then-invitation locks, `revoke`, `resend`, `list`); unit tests for normalization, mismatch, unverified, used/expired/revoked/unknown, token rotation, existing mentor, concurrent create, accept versus revoke/resend, second invitation keeping the first deadline.
6. Routes and their tests (404 ordering, headers, the accept response carrying a `Set-Cookie` whose `sv` equals the user's new `session_version`); `LocalTime`; `/invitation/[token]` and `/mentor` pages with component tests; logger path redaction.
7. `core/src/cli/invite-cli.ts`, thin `scripts/invite.ts`, `tsx` devDependency, the `invite` npm script, coverage `include` and `tooling` project for `scripts/**/*.ts`, README section; unit tests at 100% coverage.
8. Integration test: create via the script → open the link signed out → sign in with the GitHub stub → accept → land on `/mentor` with the deadline **and still signed in**; a mismatched account sees no Accept button; a signed-in user without an invitation has no "become a mentor" path.
Each step ends with `npm run validate`; step 8 runs `npm run test:integration`.
