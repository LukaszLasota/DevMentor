# Retro after the first development cycle (lesson 15)

- Date: 2026-11-23. Scope: PRs #1–#89, lessons 1–14.
- Format: What? (facts) → So what? (what it means for the project) → Now what? (one concrete step, an owner, a place it is tracked).
- Team: one owner (product, design, review of agents' work, merges) and coding agents. The course retro was a team of several people; where a finding is about people talking to each other, ours is about the owner and the agents.

## What? — facts

- 59 PRs merged, 1 closed on purpose (#40, a demo of the token gate). 33 issues, 12 open.
- Every 1.0 story is implemented: E01-S01…S07, E02-S01/S02, E03-S01/S02, E04-S01/S02 (PRs #43–#65).
- Six PRs in a row (#56, #58, #61, #63, #65, #67) failed only in CI, because nobody ran the integration suite before pushing. Each one cost a CI round trip. Since 2026-11-21 the suite runs locally before every push and CI is never the first run.
- The cross-family reviewer (Qodo) stopped on 2026-11-21 when its trial ended. Reviews now come from an independent agent in a fresh session.
- Lesson 14 fixes: 2 of 2 merged without owner remarks. The independent review raised 3 remarks (#88) and 4 remarks (#89), all fixed before merge. 0 fixes came back.
- The edge probes found bugs only where states combine (a mentor unpublishes or clears their name *after* a booking: #85, #86, #87), never at single-field boundaries.
- The first manual end-to-end walk by a person happened in lesson 11, more than a month after the first PR. Within minutes it raised usability problems that 100% unit coverage and the integration suite had not:
  - how to sign in as which demo account;
  - an empty mentor list on a fresh database;
  - the session length looks like a label, not a choice (#79);
  - the way from a mentor card to booking is not obvious (#78);
  - the role notice does not say which account is signed in (#80).
- `/` (`packages/app/src/app/(marketing)/page.tsx`) is still the Next.js starter page: "To get started, edit the page.tsx file", Vercel links and the Next logo. No story in the backlog covers the home page, a shared header and footer, or the landing page.
- The brief's warning line counts paid sessions "in the fourth week after ship" (week ending 2026-11-28, `product-brief.md:66`). Nothing has shipped. No deploy target, environment or story exists, and the CI workflows only test.
- The brief, backlog and specs say nothing about privacy, consent, data retention or a privacy policy. The app stores e-mails, GitHub profiles, session chats and payment references.
- There is no data on cost per task or on where the agents got stuck. Sessions are local to one machine and are never analysed.

## So what? — what it means

1. **The backlog describes features, not finished screens.** Each story was done to its spec, yet a visitor's first screen is a framework placeholder. This is the same gap the course team found (home page, header, footer). Nobody owned "the product as a whole looks finished".
2. **Human acceptance came too late.** Usability problems surfaced only when a person clicked through, and tests cannot catch them, because the tests encode the spec, not how it feels to use. A story is not done until someone has walked it in the app.
3. **The validation plan is detached from reality.** The brief's 4-week check after ship cannot happen, because shipping is not in the plan. A01 (developers pay a stranger for a text session) is still untested, and every week of feature work adds to the unvalidated bet.
4. **Quality gates work once they are local.** The CI-only failures stopped as soon as the integration suite became a pre-push step. The lesson 14 numbers show that a second agent's review catches real issues (7 remarks in 2 PRs), and that RED/GREEN evidence leaves nothing to return.
5. **One dropped reviewer is a single point of failure.** When Qodo stopped, cross-family review stopped with it. A same-family fresh-session reviewer is better than none, but it shares the author's blind spots.
6. **Context drift is a risk we have not measured.** See "Context consistency" below.
7. **We optimise nothing, because we measure nothing.** Without data on review remarks, rework and cost per PR, we cannot say whether a cheaper model or a shorter context would hurt quality. Quality comes first, then cost.
8. **The harness has an owner, but it has no changelog of friction.** Sandbox workarounds (standalone `gh`, `--body-file`, owner-run `git fetch`, no `git worktree add`, the MikroORM snapshot rewritten by tests, `!` running only the first command of a chain) live in lessons and in the playbook, spread over many lines. Each one costs a round trip per session.

## Context consistency

A read-only agent compared the brief, backlog, specs, AGENTS.md files and design docs with the code. We have the same problem the course team had: decisions were made in specs and PRs, but nobody wrote them back into the documents agents read first.

| Drift | Risk for an agent | Fixed in |
|---|---|---|
| Brief R10/D10: "no automatic refunds in 1.0". The code refunds a free cancellation through Stripe, which the owner confirmed in the cancellation spec. | a reviewer flags shipped behaviour as a blocker | this PR (D25) |
| Brief Q01 (where the session runs) and Q04 (Connect) are still "open". Both were answered in specs, and the code ships both. | an agent treats the session or payout work as blocked | this PR |
| `2026-10-21-stripe-connect-payouts.md` is "approved for 1.1", and the backlog says E01-S06 "moved to 1.1". Superseded by mentor payouts, which shipped. | an agent re-implements payouts or treats them as out of scope | this PR (spec archived) |
| "Favorites" appears as a mentee page in `docs/design-system.md` and in code comments. It is in no scope list and has no code. It came from a lesson-06 agent test. | an agent builds a feature nobody asked for | this PR |
| Eight implemented specs lived outside `implemented/`, three of them still "approved". Specs, QA scenarios, README and lessons cited them at the old paths. | an agent reads a done spec as work to do | this PR |
| `packages/ui/POSTEP.md` (on the UI routing row) says currency is open, payouts are 1.1, and cites `/admin/users` and `/admin/payouts`, which do not exist. | wrong routes and states in UI work | this PR (marked historical) |
| The engineering standards spec says `auth.ts` is not done, and its §1 still prescribes `force-dynamic`. | a refactor "adds" what exists or uses a forbidden export | this PR |
| Brief dates have passed (ship 2026-10-31, warning line 2026-11-28) and nothing has shipped | the validation plan reads as on track | owner decision, step 3 |

Clean: the 20% fee, 2-hour lead time, 24-hour cancellation, 25/50-minute sessions, PLN bounds, list ordering, and no ratings code all match the code. `check:agents` passes. Vault and async Q&A stay parked in E05.

## Now what? — next steps

| # | Step | Owner | Where |
|---|---|---|---|
| 1 | Story for the home page and the shared public shell (header, footer, "Find a mentor", sign-in), built from the design system; remove the Next starter | owner decides, agent implements | new issue |
| 2 | Add "walked in the app by a person" to the Definition of Done for any story with UI (`SDLC.md`), with the demo-account table from `packages/core/src/cli/demo-accounts.ts` | agent drafts, owner approves | `SDLC.md` |
| 3 | Decide where 1.0 runs (hosting, Stripe live or test mode, domain) and add a deploy story, so the brief's 4-week check can actually start; otherwise move the warning-line date in the brief | owner | brief + new issue |
| 4 | Privacy and consent review: what personal data we keep, for how long, the legal basis, and a privacy page. Run it before any analytics. | owner, agent drafts | new issue |
| 5 | Put one person from outside the project in front of the share-link → book → pay flow (on the test env) and write down where they stop | owner | `.ai/context/` notes |
| 6 | Fix the context drift listed above, in the files themselves, with the reason recorded in the decision log | agent | one docs PR |
| 7 | A quarterly or per-epic consistency pass over brief, backlog, specs and AGENTS.md, run as a read-only agent review; `check:agents` checks length and paths, not meaning | agent, owner reviews | `.ai/README.md` |
| 8 | Track per-PR quality in the PR description footer (review remarks, CI reruns, returned after merge) so the next retro has numbers without digging | agent | `om-open-pr` habit |
| 9 | Restore a cross-family reviewer for high-risk PRs (money, auth) when one is available; until then, the reviewer gets the code and the issue, never the author's conclusions | owner | `CODE_REVIEW.md` |
| 10 | Keep the harness friction list in one place (`.ai/security-notes.md` § Sandbox workarounds) and revisit it at each retro: drop a rule that no longer pays for itself | owner | `.ai/security-notes.md` |
