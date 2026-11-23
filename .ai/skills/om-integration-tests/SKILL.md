# om-integration-tests — DevMentor override

Load the installed `om-integration-tests` skill first; the rules below are added on top of it. Safety rules (AGENTS.md § Agent workshop security) still win.

## Runner and layout (do not replace)

- Runner: Vitest + testcontainers + `agent-browser`, config `vitest.integration.config.mts` (timeouts live there — no per-test overrides). Command: `npm run test:integration` (owner-approved; builds first). While iterating on one file: `npx vitest run --config vitest.integration.config.mts packages/app/integration/<file>.test.ts` after a fresh `npm run build`.
- The suite boots its own PostgreSQL, Stripe and GitHub stubs and `next start` (`packages/app/integration/global-setup.ts`); it does **not** attach to `.ai/qa/test-env.json` — that env is for manual QA and the `.ai/scripts/qa-*.mjs` walks. Explore flows on the test env, write tests for the suite.
- Tests live in `packages/app/integration/<area>-<behaviour>.test.ts`, one business scenario per file. Reuse the helpers: `agent-browser.ts` (browser), `psql.ts` (SQL on the suite database), `stripe.ts` (stub events, sessions, resend), `mail.ts` (log mailer), `fixtures/mentors.ts` (`seedBookableMentor`, `inHours`).
- Every test file creates its own users with a per-run prefix (`<xx>-<role>-${run}@devmentor.test`) and deletes them in `afterAll` in FK order (payouts → connect_accounts → booking_reports → bookings → invitations → users). Never rely on `npm run db:seed` accounts except `mock-operator` (the operator role comes from `OPERATOR_EMAILS`). A second operator who is also a mentor is `fixtures/operators.ts` (`OPERATOR_MENTOR_LOGIN`, in the suite's `OPERATOR_EMAILS`); a file using it removes its leftovers in `beforeAll` too, because the login is fixed.

## Scenario documents

- Every new test has a Markdown scenario in `.ai/qa/scenarios/<area>/TC-<AREA>-<NNN>-<slug>.md` (areas: `BOOK`, `PAY`, `SESSION`, `NOTE`, `PAYOUT`, `ADMIN`; `NNN` = next free number in the area). It states: test file link, spec link, priority, Given/When/Then, edge cases, and what is checked at which level (UI, API, database, stub).
- The test file's header comment links back to its scenario.

## Rules learned in this repo

- Apply `references/best-practices.md` to every scenario (behaviour not implementation, deterministic, one case per scenario, concrete assertions).
- Access-control scenarios follow the three-check rule in `AGENTS.md` § Quality gates: positive control for both accounts, denied read and denied write with a valid payload, the owner's data unchanged after the attempt.
- Time travel only through SQL on `bookings` times or hold expiry, as the existing tests do; never sleep for real time windows.
- Stripe is the stub: drive payments with `POST <checkoutUrl>/complete`, redeliveries with `resendStubEvent`, Connect with `/__stub/accounts/<acct>/enable`; assert what the app sent (transfers, refunds) through `/__stub/*`.
- Text read from `agent-browser` collapses whitespace differently than the DOM: normalise with `.replace(/\s+/g, ' ')` before `toContain`.
- Before pushing, the owner runs the affected integration files locally (lesson 2026-11-21: CI is never the first run).
- `agent-browser` selectors are plain CSS: Playwright pseudo-classes such as `:has-text()` match nothing (count 0). Scope a row by its text instead (e.g. the normalised `main` text matching `<label>\s*<booking id>`).
- The operator's payout release is global: assert its response (`remaining: 0`) so another file's leftovers cannot push this booking out of the batch.
- `npm run test:integration` rewrites `packages/db/src/migrations/.snapshot-devmentor.json` (key order only): restore it with `git checkout --` before committing.
