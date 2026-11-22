# Lesson 13 — parallel work and automations (DevMentor)

Homework of AI Tech Leaders lesson 13, 2026-11-22. Four parts: classify ten backlog tasks, the tool for parallel agents, one automation, and a summary.

## 1. Ten backlog tasks by work type

Each issue carries one label: `work-parallel` (fully parallel), `work-2-3` (two or three at once), `work-sequential` (one at a time), `work-interactive` (owner in the loop).

| Issue | Task | Type | Why |
|---|---|---|---|
| #74 | Integration suite leaves the MikroORM snapshot rewritten | parallel | one setup file, CI + `git status` verify it |
| #75 | Helper to scope assertions to one table row | parallel | test helper only |
| #76 | QA walk for mentor payouts | parallel | new script, no shared files |
| #77 | Lint warning from an untracked local skill folder | parallel | config one-liner, `npm run lint` verifies it |
| #78 | Mentor card: make the way to booking obvious | 2–3 | small UI, but the result needs a look |
| #79 | Session length choice looks non-interactive | 2–3 | UI polish, visual review |
| #80 | Role notice names the account and offers switching | 2–3 | shared auth UI, copy review |
| #81 | Speed up the integration suite | sequential | shared test setup every test change depends on |
| #83 | E05 vault publishing after the D22 readout | sequential | gated by a dated decision, then spec → implementation |
| #82 | E05 async questions with a 24-hour reply | interactive | product decisions first (pricing, refunds vs R10) |

Distribution: 4 parallel, 3 two-or-three, 2 sequential, 1 interactive. The parallel ones are small, independent and verified by a machine check; anything a person must look at caps at three; anything touching shared setup or waiting on a decision goes alone.

## 2. Tool for parallel agents

No separate cockpit (Cezar) is installed. Its parallelism is covered by what this repo already runs in Claude Code:

- **Subagents** (the Agent tool) for independent work and for reviews that should not be anchored on the author. Used for the independent review of PR #72.
- **Workflows** (multi-agent scripts) for fan-out with an explicit opt-in. Not used yet, because the cost should be chosen deliberately.
- **Isolation:** each task gets its own branch, and worktrees are available. The sandbox keeps `.git/worktrees` read-only, so the owner creates them.
- **Checks as separate steps whose result returns to the agent:** `npm run validate`, `npm run test:integration` (owner-approved), and CI on every PR. The agent reads the result and fixes; the owner only merges.

Blockers and what would have to change:

- **WSL2:** Claude in Chrome is not supported, so browser checks run through `agent-browser` scripts (`.ai/scripts/qa-*.mjs`) instead.
- **Sandbox:** Docker, `git push` and `gh` work only as standalone excluded commands, so compound commands silently fall back into the sandbox. Owner-run steps (`!`) execute only the first command of an `&&` chain.
- **Cezar itself:** it would be a new local app driving the same agents. Under this repo's rules it is an owner decision (agent config is code, CODEOWNERS), not something an agent installs.

## 3. Automation

`.github/workflows/nightly.yml` runs at 02:17 UTC every night and can also be started by hand (`workflow_dispatch`). It runs the dependency audit gate and the full integration suite against `main`. When the scheduled run fails, it opens one "Nightly checks failed on main" issue, or comments on the open one. The owner triages it in the next review block, not on the notification. It runs on schedule only after the workflow is merged to `main`. The first result is checked with a manual dispatch after merge.

## 4. Summary

The owner's own reflection, drafted by the agent from this project's sessions for the owner to edit, is in the PR description.
