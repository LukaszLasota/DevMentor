# Lesson 16 — security of the product: threat model, access control, SAST and DAST

- Date: 2026-11-23. Branch `feat/lesson-16-security`; base: `main` after PR #91.
- Environment: the local test env (`sh .ai/scripts/test-env-up.sh`, `.ai/qa/test-env.json`), with a throwaway database and the Stripe and GitHub stubs. Synthetic accounts only. No shared or production environment was touched.
- Threat model: `docs/security/threat-model.md` + `.mmd`, built with the `threat-model` skill (`pat-lewczuk/skills`, pinned in `skills-lock.json`). It lists 14 threats. The three with the highest impact on access control and data isolation are T-01, T-02 and T-06.
- Walk: `node .ai/scripts/qa-access-control.mjs`. It checks all three boundaries over HTTP with the three-check rule (`AGENTS.md` § Quality gates). Result after the fix: 27/27.

## Evidence cards

```text
Evidence card — T-01: another mentee's booking
Requirement / hypothesis: a mentee can read and act only on their own bookings (spec booking-stripe-checkout AC, threat model T-01).
Scope and risk: GET /api/bookings/{id}, POST …/cancel (refund), POST …/report; Impact High (another person's booking, money).
Base and target commit: main after #91 → this branch.
Environment, seed, account and time: test env 2026-11-23; GitHub stub accounts acl-a-<run> (owner) and acl-b-<run> (attacker), both mentees, each with an own paid booking.
Check: qa-access-control.mjs T-01 — A reads own booking (200, confirmed), B reads own booking (200); B: GET A's booking, POST cancel {expectRefund:true}, POST report with a valid 20+ character message; A re-reads.
Expected behavior: 404 for all three B requests (same answer as an unknown id), A's booking JSON identical, no report row.
Actual result and where: 404 / 404 / 404, booking identical field by field, 0 report rows. Script output above (27/27).
What this does not prove: other booking routes (release) and the mentor side of the booking, which the unit tests cover. Ids are UUIDs, so guessing was not tested.
Decision and owner: no change needed. Owner: Łukasz Lasota.
```

```text
Evidence card — T-02: a text session by a non-party
Requirement / hypothesis: only the booking's mentee and its mentor read or write the session (spec text-session AC4: anyone else gets 404).
Scope and risk: GET /api/sessions/{id}, POST …/messages; Impact High (private conversation).
Base and target commit: main after #91 → this branch.
Environment, seed, account and time: test env 2026-11-23; owner acl-a-<run> with mock-mentor; attackers acl-b-<run> (mentee) and mock-operator (the strongest role); the session opened by moving the booking's times in the test DB.
Check: qa-access-control.mjs T-02 — A writes a marked message and reads it back (200); the mentor reads the session (200); the operator is shown signed in with the operator role and reaches /admin (200); B and the operator each GET the session and POST a valid message; A re-reads.
Expected behavior: 404 for both reads and both writes, no message text in the responses, A's messages identical (ids, authors, bodies), no foreign row in session_messages.
Actual result and where: 404 ×4, no leak, messages identical, 0 foreign rows.
What this does not prove: the note and answer routes (`/note`, `/answer`), which the session-note and text-session integration tests cover for a foreign mentee only. Mentor B (another mentor) was not a separate attacker here.
Decision and owner: no change needed; mentor B as an attacker is a follow-up. Owner: Łukasz Lasota.
```

```text
Evidence card — T-06: an operator resolves the dispute on their own booking
Requirement / hypothesis: resolving a dispute releases the held payout (spec mentor-payouts), so the mentor of the booking must not do it, even with the operator role (roles combine, spec sign-in-github-and-email).
Scope and risk: POST /api/admin/reports/{id}/resolve; Impact High (money to oneself, repudiation).
Base and target commit: main after #91 (RED) → this branch (GREEN).
Environment, seed, account and time: test env 2026-11-23; mock-operator (operator from OPERATOR_EMAILS) made a mentor in the test DB with a published page; mentee acl-a-<run> reports one paid booking with this operator-mentor and one with mock-mentor.
Check: qa-access-control.mjs T-06 + integration test report-own-booking-resolve.test.ts (TC-PAYOUT-002); positive control = the same account resolves the report on mock-mentor's booking.
Expected behavior: 200 on the other mentor's report, 403 FORBIDDEN on its own, own report still open.
Actual result and where: BEFORE the fix, 200 on its own report (walk FAIL; integration RED "expected 200 to be 403" at report-own-booking-resolve.test.ts:91). AFTER: 403 FORBIDDEN, report open; the walk passes 27/27, the integration suite is green (owner run), and validate passes.
What this does not prove: an operator acting through the DB or the CLI. Payout release is global and releases only eligible bookings, so it is not a separate path. Who resolved a report is still not stored (T-14).
Decision and owner: fixed in this PR. Storing `resolvedBy` is a follow-up. Owner: Łukasz Lasota.
```

## SAST and DAST (`sh .ai/scripts/sec-scan.sh`, owner-run; reports in `.ai/qa/lesson-16-sast-dast/`)

| | Semgrep CE (SAST) | ZAP baseline (DAST) |
|---|---|---|
| Image | `semgrep/semgrep@sha256:67518c17…` | `zaproxy/zap-stable@sha256:9624669d…` |
| Coverage | 675 files under `packages/` scanned; rulesets typescript, react, nextjs, nodejsscan, owasp-top-ten, secrets; 5 files parsed only partly (4 tests with generic call syntax, plus the starter `/` page) | passive spider and passive rules on the test env, no session (unauthenticated pages only) |
| Findings | 42: 33 are fixture secrets in tests; 9 in source are false positives on triage (`x === undefined` comparisons named token/secret/hash flagged as timing attacks, an anchored character test flagged as ReDoS, the redaction regex in `logger.ts`, a UI string containing "password"). `demo-accounts.ts:6` is the known dev-only demo password. | 14 alerts. Medium: no CSP, no anti-clickjacking header. Low: no COEP/COOP/CORP, no Permissions-Policy, `X-Powered-By: Next.js`, no `X-Content-Type-Options`. Informational: **the sign-in and register forms put the email and the password in the URL** when submitted before hydration (`/sign-in?email=…&password=…`), because the native form method is GET. |
| Not checked | authorization and business logic (no rule knows who owns a booking); rules for MikroORM queries; the 5 partly parsed files | everything behind sign-in; active attacks (baseline is passive); CSRF (custom header) and the webhook signature; rate limits |

Neither scan can confirm access control. That is what the walk and the integration test above are for.

## Follow-ups (each must be reproduced before it reaches the backlog)

1. Security headers (CSP, `frame-ancestors`/X-Frame-Options, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy, `poweredByHeader: false`): ZAP, T-13.
2. Sign-in and register forms: set `method="post"` so a submit before hydration never puts the password in the URL (CWE-598). ZAP shows it; reproduce it in a browser with JS disabled.
3. Store who resolved a report or retried a refund (T-14), together with T-06.
4. T-07 (payout without a delivered session), T-08 (the webhook does not compare the checkout session id), T-12 (`TRUSTED_PROXY_HOPS` on the real host): the threat model's open questions, which are the owner's decisions.
5. T-02 with mentor B as the attacker; the `/note` and `/answer` routes for the operator.
