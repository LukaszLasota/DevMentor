# Lesson 17 — review and acceptance of agents' work

- Date: 2026-11-23. Solo repository: one owner, agents write and review the code.

## Exercises

1. **Whose move:** there were no open PRs left (#91–#95 merged). The PR for this lesson gets `/om-auto-review-pr` by number. Since it is the owner's own PR, the approve is a comment.
2. **Queue preview** (the `om-review-prs` filter through `gh`, with the author ≠ me): **0 PRs**. Every PR in this repo is the owner's, and the skill does not review the runner's own PRs, so an empty list is the correct result.
3. **Branch protection:** ruleset `main through PRs with green CI` (id 27903072, active on the default branch):
   - a PR is required, with 1 approval, stale approvals dismissed, the last push approved, and threads resolved;
   - deletion and force push are blocked;
   - the 7 CI jobs are required status checks;
   - bypass: the Repository admin role, for pull requests only. The solo owner merges without a second person, but always through a PR with green CI.

   Remove the bypass when a second reviewer joins.

## Homework: a deterministic gate for a bug that came back despite review

The blank or ad-hoc mentor name came back twice:
- #85 on the mentee's booking, fixed in #88;
- then #87 in three more services (cancellation e-mails, the `/admin` report list, payouts).

Each time a service wrote its own `displayName ?? ''` or `?? 'your mentor'`, which also lets `''` through. LLM reviews passed the first fix without spotting the other sites.

Gate: an ESLint `no-restricted-syntax` rule in `eslint.config.mjs`. It forbids `displayName ?? / || <anything but null/undefined>` (also `p?.displayName`, a destructured `displayName` and `displayName?.trim() ||`) in `packages/core/src/services/**` outside `mentors/mentor-name.ts` and tests. It runs in the CI job "Lint & typecheck", which the ruleset now requires. `scripts/eslint-mentor-name.test.mjs` pins the rule, so it cannot be loosened silently.

```text
Evidence card — lint gate for mentor-name fallbacks
Requirement / hypothesis: every name shown to people goes through services/mentors/mentor-name.ts (fallback "Your mentor" for mentees, the e-mail for operators; '' and whitespace count as missing). An inline fallback in a service is the bug pattern of #85/#87.
Scope and risk: packages/core/src/services/** (not tests, not mentor-name.ts); low risk, lint only.
Base and target commit: RED on d061a6d^ (before #88) and 901d19c (after #88, before #89); GREEN on main 07020cf + this branch.
Environment, seed, account and time: local, 2026-11-23; no app or database needed.
Check: `git show <commit>:<file> | npx eslint --stdin --stdin-filename <file>`; on the branch `npx eslint packages/core/src/services`; CI job "Lint & typecheck" (required by the ruleset).
Expected behavior: RED with the rule's message on every inline fallback; GREEN on main.
Actual result and where: d061a6d^ booking.service.ts → 3 errors (lines 233, 491, 493); 901d19c booking-cancellation.service.ts → 2 (170, 235), booking-report.service.ts → 1 (107), payments/payout.service.ts → 1 (108). These are exactly the 7 sites of #85 and #87. Main: 0 errors.
What this does not prove: a name built another way, for example `displayName as string`, a ternary, a renamed variable (`const n = p.displayName; n ?? 'x'`), or code in packages/app. It does not check that the helper is called where a name is shown, only that no service invents its own fallback.
Decision and owner: required through the CI lint job (ruleset 27903072). Owner: Łukasz Lasota.
```
