# Integration scenario best practices (AI Tech Leaders, lesson 12)

1. **Test behaviour, not implementation.** Assert what a user or another system sees (status, page text, a stub request), never that a method was called.
2. **One business case per scenario.** Many steps are fine; one goal. Do not add cancel, refund and invoice checks to a payment scenario.
3. **Given–When–Then.** Given the starting state, When the action, Then the expected result.
4. **Deterministic.** No unseeded random data, no dependence on the current time, no shared data between tests, no `wait(5000)` — wait for a concrete state; no run-order dependence; no unstable external services.
5. **Independent.** Each test creates its data, runs, verifies and cleans up; never assume an earlier test created anything.
6. **Prepare data through the API or a test layer**, then drive only the flow under test through the UI — unless the scenario is the full user journey.
7. **Check results at the right levels** (API response, UI, database row, event, controlled external call) — only those that matter for this scenario.
8. **Replace external integrations with controlled doubles** (Stripe stub, log mailer), but assert the request the system sent (amount, ids). Never mock your own components whose cooperation is under test.
9. **Positive, negative and boundary cases**: happy path, invalid data, no permission, missing resource, conflict/repeat, integration timeout, external error, limits.
10. **Idempotency**: a repeated message, webhook or request must not perform the operation twice.
11. **Stable UI selectors**: role + accessible name, then label, then visible text, then `data-testid`; never structural CSS paths.
12. **Concrete assertions**: exact status codes and payload fields, so a failure says what differs.
13. **No over-general helpers** that hide the behaviour under test; prefer small single-purpose steps.
14. **Name = action + condition + expected result** (e.g. "refuses a payment when the webhook signature is invalid").
15. **AI drafts, humans own the expectation**: the expected result comes from the spec, not from the model's guess.
