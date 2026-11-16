# Agent context routing (lesson 10)

Status: approved
Source: course lesson 10 "Context engineering" (local copy `C:\AI techleaders\Lekcja 10`) · Skills used from `pat-lewczuk/skills` (`eliminate-no-op`, `task-router`, read and checked 2026-11-16, not installed) · Measurement: Context Scope 0.11.0 (`open-mercato/context-scope`, local, read 2026-11-16)

## Goal
Cut what every agent session pays for at start-up and point the agent to the right files per task. The root `AGENTS.md` becomes a short router ("when doing X, read Y"); rules that concern one package move next to that package; CI keeps the files small and the routes valid, so this does not drift back.

## Baseline (AS / IS, Context Scope, 2026-11-16)
- Start-up (Claude Code): 19.8k tokens (instruction files + skill descriptions); root `AGENTS.md` 8,867 tokens (Claude-calibrated), 143 lines; `CLAUDE.md` 9 lines (imports + extra rules); `packages/app/AGENTS.md` 30 lines (managed by `next dev`).
- Top finding: S-01 instruction chain oversized (high); S-06 no rules scoping; S-09 MCP server unused (`settings.local.json`); S-04 invalid frontmatter in a global Qodo skill (not ours).
- Session findings (fat tool results, long sessions, compaction) are about how sessions were run, not about the files; recorded, not in scope.

## Scope
1. **No-op audit** of `AGENTS.md`, `CLAUDE.md`, `packages/app/AGENTS.md` following `eliminate-no-op` (mechanical pass with its `analyze.py`, then directive-by-directive verdicts KEEP / TRIM / MERGE / MOVE / CUT); report kept in `.ai/context/2026-11-16-no-op-report.md` with every cut line verbatim. Stale or wrong rules fixed against the code.
2. **Task router** following `task-router`: root `AGENTS.md` = short summary, hard rules every task needs (commands, dependency direction, security boundaries, `.ai/` workflow essentials), and a `| Task | Read |` table (at least: bug fix, new feature, refactor, review, spec writing, UI screen, database change, auth/security, agent config, tests/CI). Every routed target is a concrete existing file.
3. **Per-package `AGENTS.md`** for `packages/core`, `packages/db`, `packages/ui` (and `packages/app` next to the managed Next.js block) with the rules that concern only that package — moved, never copied. Each gets a `CLAUDE.md` containing only `@AGENTS.md`.
4. **Root `CLAUDE.md`** contains only `@AGENTS.md` (Claude-specific notes move into `AGENTS.md` or are cut). Claude Code reads nested `AGENTS.md` through these imports.
5. **Example pointers**: name one reference implementation per recurring pattern (route with `apiHandler`, service + container registration, entity + migration, form with `CrudForm`, guarded page) instead of prose.
6. **`npm run check:agents`** (`scripts/lib/check-agents.mjs`, Node, no new dependencies, 100% tested): fails when a routed or referenced path does not exist, when root `AGENTS.md` > 150 lines or a package `AGENTS.md` > 120 lines (warn at 80%), or when a `CLAUDE.md` holds anything but `@AGENTS.md`. Added to `npm run validate` and the CI lint job.
7. **TO BE** measurement after a few new sessions (Context Scope), recorded next to the baseline.

## Out of scope
- Skill descriptions and skill contents (course leaves them unchanged); removing the duplicate Qodo / superpowers installs is the owner's action.
- The managed blocks in `packages/app/AGENTS.md` (written by `next dev`; must not be edited).
- `.claude/rules/` with `paths:` frontmatter (Context Scope's suggestion): Claude-only, while `AGENTS.md` is read by Codex and other agents too — the router covers the same need; revisit if a rule must apply automatically by path.
- Session habits (long sessions, fat tool results): noted for the owner.

## Requirements
- R1 No rule is lost: every directive of the old files is either kept, moved (target named), merged, or cut (listed verbatim in the report).
- R2 Security rules (lesson 9) stay in the root file: they apply to every task.
- R3 `check:agents` runs in CI and in `validate`; it is tested at 100% like other scripts.
- R4 Changes to `AGENTS.md`/`CLAUDE.md` are CODEOWNERS-owned: the PR is reviewed by the owner.

## Acceptance criteria
- Root `AGENTS.md` ≤ 150 lines with a routing table; every path in it exists (`npm run check:agents` green).
- Package `AGENTS.md` files exist where they carry package-specific rules; every `CLAUDE.md` is only `@AGENTS.md`.
- No-op report with before/after token estimates and the cut lines.
- `npm run validate` green incl. `check:agents`; CI green.
- Baseline and TO BE recorded in this spec.

## Decisions in play
- Skills used from a temporary checkout instead of being installed (installing writes to `.claude/skills/`, which the lesson 09 sandbox protects; they are needed once).
