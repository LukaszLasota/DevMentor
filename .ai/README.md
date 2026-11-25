# AI workspace and workflow

Details of the `.ai/` workflow summarised in the root `AGENTS.md` § AI workspace. Read this file when writing or updating a spec, keeping a run log, recording a lesson or creating a skill.

## Layout

All AI-generated working artifacts live in `.ai/` — never in the repo root, `docs/`, or an agent's private memory only (specs from planning/brainstorming skills go to `.ai/specs/`, not the skill's default location).

- `.ai/specs/` — specs for spec-driven development, active / in progress; `implemented/` — done; `archive/` — abandoned or superseded; `capabilities/` — current-state digests of a capability, kept up to date when a spec changes it; `research/` — discovery material (interviews, benchmarks, personas) and `research/decisions/` (one file per recorded product decision). The undated `product-brief.md` and `backlog.md` are living documents.
- `.ai/runs/` — logs of autonomous AI runs: a single file, or a folder `YYYY-MM-DD-slug/` when the run skill keeps a plan and checkpoints (e.g. `om-auto-create-pr-loop`). `.ai/context/` — agent-context audits.
- `.ai/lessons.md` (index, newest first) + `.ai/lessons/` (detailed write-ups) — this project's long-term memory for every agent.

Every spec, run log and lesson file is named `YYYY-MM-DD-slug.md` (a run folder `YYYY-MM-DD-slug/`; living documents, capability digests and decision records are exempt): the creation date (do not rename when updated or moved) and a short kebab-case slug, e.g. `2026-10-20-user-login.md`.

## Mandatory workflow

1. **Before any task** — read `.ai/lessons.md` and every linked lesson relevant to the task. Check `.ai/specs/` for a spec covering the work.
2. **Specs (SDD)** — any non-trivial feature or change starts from a spec in `.ai/specs/`. Write it (or ask the user to approve it) before implementing. A spec contains at least: goal, scope / out of scope, requirements, acceptance criteria, and a status line (`Status: draft | approved | in-progress | implemented | archived`). Implement against the spec; if the implementation must diverge, update the spec first.
3. **After implementing a spec** — set `Status: implemented` and move it to `.ai/specs/implemented/` (`git mv`, same filename). Dropped or superseded specs go to `.ai/specs/archive/` with a one-line reason at the top.
4. **Autonomous runs** — every autonomous / unattended run (loops, scheduled agents, multi-step runs without the user in the loop) creates `.ai/runs/YYYY-MM-DD-slug.md` at the start and keeps it updated: goal, linked spec, steps, decisions and why, commands/tests with results, files changed, open issues, outcome. Same-day runs on one topic get distinct slugs (`-2`, `-retry`).
5. **Lessons** — after fixing a bug, discovering a non-obvious behaviour, a tooling/framework gotcha, a user correction, or a workflow improvement, add a one-line entry to `.ai/lessons.md` (newest first) before finishing; if it needs context (root cause, repro, reasoning), also create `.ai/lessons/YYYY-MM-DD-slug.md` and link it. Do not record what is obvious from the code or git history. Fix or delete lessons that turn out to be wrong.
6. **Before reporting a task as done** — confirm the spec status/location, run log and lessons are up to date.

## Working principles

- **Plan complex work first** — for multi-step or multi-file tasks, plan before writing code; the approved plan becomes or updates the spec. If implementation goes sideways, stop and re-plan instead of pushing through.
- **Verify with evidence** — check UI changes in the running app (`npm run dev`, owner approval). Never report done without evidence; if a check fails, say so.
- **Review before PR** — critically review your own diff before committing; if a solution is hacky, rewrite it cleanly now rather than leaving it.
- **Turn corrections into rules** — when the user corrects you, record it as a lesson; if it is a general rule for this repo, update the root `AGENTS.md` (or the package `AGENTS.md` it concerns) instead.
- **Use subagents** for broad searches and independent subtasks.
- **Automate repeats** — a task done repeatedly becomes a skill shared by every agent: write it in `.agents/skills/<name>/SKILL.md` and symlink it for Claude Code (`ln -s ../../.agents/skills/<name> .claude/skills/<name>`). Installed collections (`om-*`, tracked in `skills-lock.json`) are installed with `npx skills add <source> -a claude-code -a codex` and never edited in place — customize an `om-*` skill with a repo-local `.ai/skills/<name>/SKILL.md` extension.
