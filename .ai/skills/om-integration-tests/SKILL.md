# om-integration-tests — DevMentor override

Load the installed `om-integration-tests` skill first; the rules below are added on top of it. Safety rules (AGENTS.md § Agent workshop security) still win.

## Runner and layout (do not replace)

- Runner: Vitest + testcontainers + `agent-browser`, config `vitest.integration.config.mts` (timeouts live there — no per-test overrides). Command: `npm run test:integration` (owner-approved; builds first). While iterating on one file: `npx vitest run --config vitest.integration.config.mts packages/app/integration/<file>.test.ts` after a fresh `npm run build`.
- The suite boots its own PostgreSQL, Stripe and GitHub stubs and `next start` (`packages/app/integration/global-setup.ts`); it does **not** attach to `.ai/qa/test-env.json` — that env is for manual QA and the `.ai/scripts/qa-*.mjs` walks. Explore flows on the test env, write tests for the suite.
- Tests live in `packages/app/integration/<area>-<behaviour>.test.ts`, one business scenario per file. Reuse the helpers: `agent-browser.ts` (browser), `psql.ts` (SQL on the suite database), `stripe.ts` (stub events, sessions, resend), `mail.ts` (log mailer), `fixtures/mentors.ts` (`seedBookableMentor`, `inHours`).
- Every test file creates its own users with a per-run prefix (`<xx>-<role>-${run}@devmentor.test`) and deletes them in `afterAll` in FK order (payouts → connect_accounts → booking_reports → bookings → invitations → users). Never rely on `npm run db:seed` accounts except `mock-operator` (the operator role comes from `OPERATOR_EMAILS`).

## Scenario documents

- Every new test has a Markdown scenario in `.ai/qa/scenarios/<area>/TC-<AREA>-<NNN>-<slug>.md` (areas: `BOOK`, `PAY`, `SESSION`, `NOTE`, `PAYOUT`, `ADMIN`; `NNN` = next free number in the area). It states: test file link, spec link, priority, Given/When/Then, edge cases, and what is checked at which level (UI, API, database, stub).
- The test file's header comment links back to its scenario.

## Rules learned in this repo

- Apply `references/best-practices.md` to every scenario (behaviour not implementation, deterministic, one case per scenario, concrete assertions).
- Time travel only through SQL on `bookings` times or hold expiry, as the existing tests do; never sleep for real time windows.
- Stripe is the stub: drive payments with `POST <checkoutUrl>/complete`, redeliveries with `resendStubEvent`, Connect with `/__stub/accounts/<acct>/enable`; assert what the app sent (transfers, refunds) through `/__stub/*`.
- Text read from `agent-browser` collapses whitespace differently than the DOM: normalise with `.replace(/\s+/g, ' ')` before `toContain`.
- Before pushing, the owner runs the affected integration files locally (lesson 2026-11-21: CI is never the first run).
