# Agent context routing (lesson 10)

Status: in-progress (items 1–6 implemented 2026-11-16; 7 open)
Source: course lesson 10 "Context engineering" (local copy `C:\AI techleaders\Lekcja 10`) · Skills used from `pat-lewczuk/skills` (`eliminate-no-op`, `task-router`, read and checked 2026-11-16, not installed) · Measurement: Context Scope 0.11.0 (`open-mercato/context-scope`, local, read 2026-11-16)

## Goal
Cut what every agent session pays for at start-up and point the agent to the right files per task. The root `AGENTS.md` becomes a short router ("when doing X, read Y"); rules that concern one package move next to that package; CI keeps the files small and the routes valid, so this does not drift back.

## Baseline (AS / IS, Context Scope, 2026-11-16)
- Start-up (Claude Code): 19.8k tokens (instruction files + skill descriptions); root `AGENTS.md` 8,867 tokens (Claude-calibrated), 143 lines; `CLAUDE.md` 9 lines (imports + extra rules); `packages/app/AGENTS.md` 30 lines (managed by `next dev`).
- Top finding: S-01 instruction chain oversized (high); S-06 no rules scoping; S-09 MCP server unused (`settings.local.json`); S-04 invalid frontmatter in a global Qodo skill (not ours).
- Session findings (fat tool results, long sessions, compaction) are about how sessions were run, not about the files; recorded, not in scope.

## TO BE (so far)
- First cut (2026-11-16, owner's Context Scope scan): root `AGENTS.md` 8,867 → 6,093 tokens (Claude-calibrated), 143 → 102 lines.
- Second cut (2026-11-16, owner decision: `.ai/` workflow details and working principles → `.ai/README.md`): root `AGENTS.md` 102 → 70 lines, 3,166 → 2,159 est. tokens (`analyze.py`, ≈ chars/4, −32%); Claude-calibrated ≈ 4,155 (estimate, scaled from 6,093). `.ai/README.md` 31 lines / ≈ 985 est. tokens, read on demand via the router. Details: `.ai/context/2026-11-16-no-op-report.md` § Second cut.
- Start-up 19.8k tokens: unchanged until new sessions exist. Context Scope re-measure after new sessions: owner.

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

## Implementation notes (item 6)
- `scripts/check-agents.mjs` (thin entry) → `scripts/lib/check-agents.mjs`; tests next to both (tooling project, 100%). Runs first in `npm run validate` and as its own step of the CI lint job.
- `packages/app/AGENTS.md` budget counts only our part below the last `<!-- END:… -->` marker (the `next dev` blocks above it are not ours to trim).
- Paths checked: backticked tokens starting with `.ai/`, `.github/`, `.claude/`, `.agents/`, `packages/`, `docs/`, `scripts/`; bare root file names (`*.md|json|mjs|mts|ts`) only in the root file. Skipped: placeholders (`<…>`, `YYYY`, `{…}`, globs, `…`), dotenv names, dated naming examples (`2026-10-20-user-login.md`), and the documented allowlist (`src/app/layout.tsx`, `packages/app/src/app/layout.tsx`). `.codex/` is never checked (no checked prefix); `.mcp.json` exists and is checked as a root file name.
- Package file names: in `packages/<pkg>/AGENTS.md`, a bare or section-relative name with a file extension (`ts|tsx|mts|mjs|js|json|md|css|yml|yaml`) or a trailing `/` (`errors.ts`, `forms/CrudForm.tsx`, `invitation/`) must match a file under `packages/<pkg>/` (walk skipping `node_modules`, build output) whose path ends with `/<name>`. One brace group is expanded (`feedback/{A,B}.tsx` → each must exist). Not names: repo paths, `node_modules/…`, `@scope/…` imports, dot names, calls (`NextResponse.json()`), placeholders.
- `§ Name` / `§2` after a markdown path is matched against the target's headings (warning only). Every root routing row must name at least one repo path.
- First run on the repo: all routes valid; one false-positive section warning (sentence period captured in `§ Reference implementations.`) fixed in the parser.
- Qodo review fixes: package file names were never verified (now checked; first run found `page.tsx` in `packages/ui/AGENTS.md`, not a ui file — reworded to the `packages/app/src/app/` folder; `NextResponse.json` in `packages/app/AGENTS.md` written as the call `NextResponse.json()`); dead allowlist entries `.codex/`, `.mcp.json` removed; no-op report line count corrected (root 102 lines).
- The lesson-10 Qodo review ran in "lite" mode with `claude-haiku-5-5` — the same model family as the author. Next time run `qodo review --deep` to get the GPT reviewer.

## Decisions in play
- Skills used from a temporary checkout instead of being installed (installing writes to `.claude/skills/`, which the lesson 09 sandbox protects; they are needed once).
