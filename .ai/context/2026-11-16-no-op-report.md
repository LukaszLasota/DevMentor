# No-op audit: AGENTS.md, CLAUDE.md, packages/app/AGENTS.md

**Audited:** 2026-11-16 · **Mode:** full (repo access; every path, script, command and symbol checked against the code)
**Also read for cross-file duplication:** `CLAUDE.md`, `packages/app/AGENTS.md`, `packages/app/CLAUDE.md`, `README.md`, `CODE_REVIEW.md`, `SDLC.md`, `docs/design-system.md`, `.ai/specs/2026-09-01-engineering-standards.md`, `.github/CODEOWNERS`, `.github/workflows/ci.yml`, `package.json` (root + packages), `eslint.config.mjs`, `vitest.config.mts`
**Spec:** `.ai/specs/2026-11-16-agent-context-routing.md` (scope items 1–5) · **Method:** `eliminate-no-op` (mechanical pass with its `analyze.py`, then directive-by-directive verdicts) and `task-router`
**Calibration:** root `AGENTS.md` / `CLAUDE.md` — strictest budget (loaded at every session start); package `AGENTS.md` — on demand (Claude Code loads a nested `CLAUDE.md` when it reads files in that directory; other agents read the nearest `AGENTS.md`).

## Summary

Token estimates are `analyze.py` estimates (≈ chars/4), not Claude-calibrated counts (Context Scope baseline for the root file: 8,867 tokens).

| | Before | After | Δ |
|---|---|---|---|
| Directives (root `AGENTS.md`, analyzer count) | 110 | 85 | −25 |
| Lines, root `AGENTS.md` | 143 | 102 | −41 |
| Est. tokens, root `AGENTS.md` | 4,578 | 3,115 | −32% |
| Est. tokens, `CLAUDE.md` | 120 | 2 | −118 |
| Est. tokens loaded at Claude Code start-up (`CLAUDE.md` → root `AGENTS.md` + `packages/app/AGENTS.md`) | 5,207 | 3,117 | −40% |
| Signal density (root: directives not cut / total) | 109/110 | — | — |
| Project-noun ratio (analyzer, root) | 0.84 | 0.83 | ≈ |

Per-package files after (loaded only when working in that package):

| File | Lines | Est. tokens |
|---|---|---|
| `packages/app/AGENTS.md` (30 managed lines + 27 ours) | 30 → 57 | 509 → 1,345 |
| `packages/core/AGENTS.md` (new) | 35 | 1,089 |
| `packages/db/AGENTS.md` (new) | 20 | 378 |
| `packages/ui/AGENTS.md` (new) | 28 | 453 |

The file was not bloated with platitudes: almost every directive carries a project noun (path, command, symbol), so the cut is tiny. The waste was **scope**: about a third of the root file (HTTP layer internals, DI, MikroORM, UI shell) concerns one package only, and `CLAUDE.md` additionally imported the 509-token Next.js block into every session. The rewrite is therefore a routing change (MOVE), not a subtraction; total text grew slightly because reference-implementation pointers were added (spec item 5), but a session pays only for the packages it touches. Confidence: high for the moves and stale fixes, medium for the borderline "Working principles" (kept, see Open questions).

## Verdict breakdown

Counted per analyzer directive (headings and table rows included). `packages/app/AGENTS.md` managed blocks (28 directives) are out of scope (written by `next dev`) and counted as KEEP. `CLAUDE.md` counted per line item (6).

| Verdict | Root `AGENTS.md` | `CLAUDE.md` | `packages/app/AGENTS.md` | Total |
|---|---|---|---|---|
| KEEP | 45 | 1 | 28 | 74 |
| TRIM | 20 | 0 | 0 | 20 |
| MERGE | 8 | 0 | 0 | 8 |
| MOVE | 36 | 2 | 0 | 38 |
| CUT | 1 | 3 | 0 | 4 |

## Findings

One row per non-KEEP directive, by line of the old file. MOVE targets: `app` = `packages/app/AGENTS.md` § DevMentor app rules, `core` / `db` / `ui` = `packages/<name>/AGENTS.md`, `router` = root § Task routing.

### Root `AGENTS.md` (old)

| Line | Verdict | Code | Directive (abbreviated) | Rationale / target |
|---|---|---|---|---|
| 1 | TRIM | N10 | "# DevMentor — architecture rules" | Title now "# DevMentor" + one-sentence summary and how to use the router |
| 3 | MERGE | N4 | "These decisions are fixed." | Folded into "## Stack (fixed)" |
| 3 | MOVE | — | "Architecture overview for humans: `README.md`" | router (Local setup/env row) and `README.md` § For AI agents |
| 3 | MOVE + CUT clause | N3 | "Full engineering standards … follow it; this file is the short version." | Spec path → router rows (New feature, Refactor, Review, API route, Auth); "this file is the short version" cut (self-reference) |
| 5 | MOVE | L6 | "Next.js-specific agent rules live in `packages/app/AGENTS.md` … do not edit its marked blocks." | app (intro of our section) + router row `packages/app` |
| 9–13 | TRIM | N8 | Stack bullets | One paragraph; "(jsdom + Testing Library for React)" and "(PostgreSQL)" dropped — visible in `vitest.config.mts` / `package.json` |
| 12 | TRIM | N11 | "shadcn/ui — admin (backend) pages" | **Stale:** shadcn panel surface is used by `(auth)`, `(mentee)`, `(mentor)`, `(admin)` and `invitation/` → "signed-in panel pages" |
| 15 | TRIM | L2 | Root scripts | Split into "Commands"; `setup`/`db:migrate`/`db:seed` stay in the security section (owner-run); `check:tokens` added (it exists and CI runs it) |
| 25 | TRIM | N5 | Table row "`packages/db` … migrations, seeders" | **Stale:** no seeders in `packages/db`; seeding is `packages/core/src/cli/seed-cli.ts` + `scripts/seed.mts` |
| 28 | KEEP (part MOVE) | — | "Only `db` imports `@mikro-orm/*`; others use the types `@devmentor/db` re-exports" | Rule stays at root; re-exported types → core, db |
| 29 | KEEP (part MOVE) | — | "`ui` never imports `core` — shared shapes … mirrored in `ui/src/backend/api/types.ts`" | Import rule stays; mirroring + Ask First → core (`envelope.ts`) and ui |
| 30 | KEEP (part MOVE) | — | "Import packages through their public entries … `@devmentor/core/validators` …" | Entry rule stays (now lists `@devmentor/core/validators`, `@devmentor/ui/mentors`); validators details → core |
| 36–40 | TRIM | — | Per-layer concept paths (5 bullets) | One sentence at root; "registered in `entities/index.ts`" → db, "registered in `container.ts` + `cradle.ts`" → core |
| 42 | MOVE | N11 | "Event IDs follow `concept.entity.action` … (added with the first feature that needs it; no queue/worker)" | core § Events. **Stale:** the emitter exists (`packages/core/src/events/events.ts`, singleton `events`, used by `invite-cli.ts`) |
| 44 | MOVE | — | "## Reusable API & UI layer" | Split core § HTTP layer / ui § Panel layer; root keeps the "every route and page reuses these" rule (line 46) |
| 48–52 | MOVE | — | `core/http`: `errors.ts`, `apiHandler.ts`, `makeCrudRoute.ts`, `parse.ts` | core § HTTP layer; "No route writes its own `try/catch` or `NextResponse.json`" → app. Note: no route uses `makeCrudRoute` yet (only its test) |
| 53 | MOVE | N5 | `auth.ts` … "Pages use `packages/app/src/lib/session.ts` (`requirePageSession`, `requirePageRole`, `homeFor`)" | `requireSession`/`requireRole` → core; page guards → app. **Wrong:** `homeFor` is exported by `@devmentor/core` (`packages/core/src/auth/home.ts`), not `session.ts` |
| 54 | MOVE | — | `packages/ui/src/backend/`: `apiCall`, `CrudForm`, `DataTable`, feedback | ui § Panel layer; `HealthPanel.tsx` reference → ui § Reference implementations |
| 56–61 | MOVE | — | "New reusable components have one home each" 1–4 | ui § Where a new component goes |
| 63–66 | MOVE | — | "## Dependency injection (Awilix)": container, PROXY constructor | core § Services and DI |
| 67 | MOVE | N11 | "Lifetimes: `env`, `logger`, `orm` singletons; `em` … scoped" | core. **Stale:** singletons are also `clock`, `fetchJson`, `events`, `mailSender`, `passwordHasher` (`container.ts`) |
| 69–72 | MOVE | — | "## Database (MikroORM)": `defineEntity`, migrations, `docker compose up -d postgres` | db |
| 73 | MOVE | — | "Env: root `.env` … loaded by `next.config.ts` and the CLI config, validated by `core/src/config/env.ts` … `getOrm(options)` …" | Split: `.env` loading → app; `env.ts` → core; `getOrm` / CLI config → db; router row Local setup/env |
| 74 | MOVE | — | "One `MikroORM` instance per process …" | db (+ `packages/db/src/orm.ts`) |
| 75 | MOVE | — | "No `export const dynamic` … no `use cache` around DB reads … build with no DB" | app § Routes and rendering |
| 76 | MOVE | — | "Check-then-write on shared state … one transaction … unique constraint. No raw SQL …" | core (transaction), db (constraint) |
| 78 | MOVE | — | "## UI" | Split app / ui |
| 80 | MOVE | — | "**Design system:** read `docs/design-system.md` …" | ui § Design system + router row UI screen/component |
| 81 | MOVE | — | Route groups `(marketing)`, `(auth)`, `(admin)`, `(mentee)`, `(mentor)` | app; adds that `invitation/` has its own root layout (exists) |
| 82 | MOVE | — | Guarded pages (`requirePageSession` inside `<Suspense>`, `RoleNotice`) | app |
| 83 | MOVE | N5 | Signed-in shell "(`packages/app/src/components/account/`: the `AccountBar`, and the role sidebar `SideNav` + `accountNavSections`)" | app. **Wrong location:** only `AccountHeader`/`AccountNav`/`ShellNav` are in `packages/app/src/components/account/`; `AccountBar` and `accountNavSections` are in `packages/ui/src/components/auth/`, `SideNav` in `packages/ui/src/backend/shell/` |
| 84 | MOVE | N11 | "Admin theme: `packages/ui/src/styles.css`, imported by the admin root layout." | ui. **Stale:** imported as `@devmentor/ui/styles.css` by every panel root layout (`(auth)`, `(mentee)`, `(mentor)`, `(admin)`, `invitation/`) |
| 89 | TRIM | N5 | "Unit tests live next to the code (`*.test.ts(x)`, `scripts/**/*.test.mjs`)" | **Stale:** scripts also have `.test.mts` (`scripts/invite.test.mts`, `scripts/seed.test.mts`) → `scripts/**/*.test.{mjs,mts}` |
| 90 | TRIM + MOVE | — | Integration tests paragraph | Rule ("every HTTP + DB + UI flow gets one") stays at root; mechanics → app § Integration tests (wrapper path made repo-relative) |
| 91 | TRIM | N11 | "CI … lint + typecheck, unit tests with coverage, build without a DB, audit, integration tests" | **Stale:** `ci.yml` also runs "Values outside tokens" and "Storybook tests (a11y, light and dark)" — added |
| 92 | MERGE | N4 | "Run `npm run validate` locally before review …" | Merged into § Commands (first bullet); audit-allowlist sentence kept in § Quality gates |
| 93 | MOVE | — | "Security minimums and the review checklist …: engineering standards spec §1." | router rows Review and Auth/session/roles |
| 107–115 | TRIM | N12 | `.ai/` tree code block | Three bullets; `.ai/context/` added (new home of this report) |
| 117–121 | MERGE | N4 | "## Naming" + its two bullets | One sentence |
| 128 | TRIM | — | Autonomous runs | Same fields, shorter |
| 129–132 | TRIM / MERGE | — | Lessons step + its two sub-bullets | One step |
| 137 | KEEP (trim) | — | "Plan complex work first … (plan mode in Claude Code) …" | "(plan mode in Claude Code)" dropped: Claude-specific, the file is read by all agents |
| 138 | MERGE | N4 | "Verify every change — run `npm run validate` …" | Kept, shortened; `validate` is defined once in § Commands |
| 140 | CUT | N1 | "Fix bugs from evidence …" | Model default (reproduce → root cause → fix); its only project noun, "record the lesson (workflow step 5)", is already step 5 ("after fixing a bug") |

### `CLAUDE.md` (old)

| Line | Verdict | Code | Directive | Rationale / target |
|---|---|---|---|---|
| 2 | CUT | N4 | `@packages/app/AGENTS.md` | Loaded the Next.js block at every start-up; `packages/app/CLAUDE.md` (`@AGENTS.md`) loads it when the agent works in `packages/app` |
| 5 | CUT | N10 | "# Claude Code" | Heading of the removed section |
| 7 | CUT | N3 | "`AGENTS.md` (imported above) is the single source of truth … Follow it exactly." | Self-reference; `CLAUDE.md` is now only the import |
| 8 | MOVE | L1 | "Use `.ai/lessons.md` + `.ai/lessons/` as this project's long-term memory … not only into Claude Code's private memory" | Root § AI workspace ("never … an agent's private memory only"; "long-term memory for every agent") |
| 9 | MOVE | L1 | "Specs from planning / brainstorming skills are saved to `.ai/specs/…`, not to the skills' default locations." | Root § AI workspace (first sentence) |

### `packages/app/AGENTS.md` (old)

All 28 directives are inside the `next dev` managed blocks (`<!-- BEGIN/END:nextjs-agent-rules -->`, `<!-- BEGIN/END:nextjs-agent-feedback -->`) and stay untouched (spec: out of scope). `generate-agent-files.js` replaces only the text between the markers, so our rules were appended after them.

## Cut lines, verbatim

> **AGENTS.md L3 (clause)** — this file is the short version.

> **AGENTS.md L137 (clause)** — (plan mode in Claude Code)

> **AGENTS.md L140** — - **Fix bugs from evidence** — start from the error message, failing check or logs, reproduce, find the root cause, then fix and verify; afterwards record the lesson (workflow step 5).

> **CLAUDE.md L2** — @packages/app/AGENTS.md

> **CLAUDE.md L5** — # Claude Code

> **CLAUDE.md L7** — - `AGENTS.md` (imported above) is the single source of truth for this repo, including the mandatory `.ai/` workflow. Follow it exactly.

Trimmed fragments (information removed while the directive stayed), for the same undo purpose:

> **AGENTS.md L13** — (jsdom + Testing Library for React) … testcontainers (PostgreSQL)

> **AGENTS.md L14** — packages live in `packages/`, named `@devmentor/<name>`

> **AGENTS.md L15** — `npm run setup` (idempotent local setup) … `npm run db:seed` (dev demo accounts)

## Kept despite looking generic

| Line | Code | Why it stays |
|---|---|---|
| 3 | L1 | "Do not introduce alternatives (other ORMs, DI libraries, CSS or component frameworks)" — agents add libraries by default |
| 19 | L6 | "never loosen [`no-restricted-imports`] for convenience" — the obvious fix for a lint error |
| 42 | L1 | "never scaffold empty [concept] ones" — agents scaffold ahead |
| 88 | L1 | 100% coverage, no exclusions without approval — agents reach for `v8 ignore` |
| 97–101 | L4 | Whole "Agent workshop security" section (lesson 09, spec R2) — stays at root, unchanged except the owned-files list now says "every `AGENTS.md` and `CLAUDE.md`" (matches `.github/CODEOWNERS`) |
| 97 | L4 | `.codex/` is listed although it does not exist: a pre-emptive ownership entry mirroring `CODEOWNERS`, not a dead reference |
| 126 | L1 | "Write it (or ask the user to approve it) before implementing" — agents start coding |
| 139 | L1 | "Review before PR … if a solution is hacky, rewrite it cleanly now" — counters leaving TODO-quality code |
| 141 | L5 | "Turn corrections into rules" — recovery path after a user correction |
| 142 | — | "Use subagents for broad searches" — borderline (culture text / Claude-leaning); kept, see Open questions |

## Stale or wrong rules found (fixed in the moved text)

1. `homeFor` is attributed to `packages/app/src/lib/session.ts`; it comes from `@devmentor/core` (`packages/core/src/auth/home.ts`).
2. Signed-in shell: `AccountBar`, `SideNav`, `accountNavSections` are in `packages/ui`, not `packages/app/src/components/account/`.
3. Panel stylesheet: imported by every panel root layout, not only the admin one.
4. Stack: shadcn/ui is the panel surface for all signed-in groups, not "admin pages".
5. Event emitter "added with the first feature that needs it" — it exists (`packages/core/src/events/events.ts`).
6. DI lifetimes list only `env`, `logger`, `orm` as singletons; also `clock`, `fetchJson`, `events`, `mailSender`, `passwordHasher`.
7. `packages/db` "seeders" — none; seeding lives in `packages/core/src/cli/seed-cli.ts` + `scripts/seed.mts`.
8. CI job list missing "Values outside tokens" and "Storybook tests".
9. Script tests pattern missing `.test.mts`.
10. Verified correct: hashing (`scrypt`, `packages/core/src/security/password.ts`; the bcrypt bullet of the standards spec was already amended), every named route/service/entity/script/command, `docker compose` service `postgres`, `OPERATOR_EMAILS`, `withScope`, `scripts/hooks/pre-tool-use.test.mjs`, coverage thresholds.

`analyze.py` reported 157 "references not found"; nearly all are false positives: it strips the leading dot of `.ai/…` paths (`lstrip("./")`), resolves package-relative paths (`ui/src/…`) against the repo root and treats package names (`@mikro-orm/postgresql`) and phrases (`HTTP/rendering`) as paths. Every reference was re-checked by hand; the real findings are the list above.

## Open questions

- "Working principles" (plan first, review before PR, use subagents, automate repeats) is partly culture text; kept unchanged. Cut or keep?
- `packages/app/AGENTS.md` now states an observed convention as a rule: "A handler with more than one service call lives in `packages/core/src/http/<concept>.ts`; the route file only wires it" (every current route follows it). Confirm it is intended.
- `makeCrudRoute` has no consumer yet; keep documenting it as the CRUD path?

## Observations

- `README.md` § Tech stack ("shadcn/ui (admin pages)") and § Architecture route groups (lists only `(marketing)` and `(admin)`) are stale in the same way as findings 3–4; not changed here (README content outside the agent files).
- Root `AGENTS.md` is 102 lines (limit 150), package files 20–57 lines (limit 120); room for growth without a new file.
- `npm run check:agents` (spec item 6, separate task) should guard routes and budgets; see the spec.

## Applied rewrite

Applied in place (not as `AGENTS.rewrite.md`): spec `.ai/specs/2026-11-16-agent-context-routing.md` (approved) asks for the restructure. Undo buffer: this report + `git show <commit>^:AGENTS.md`. Files: `AGENTS.md`, `CLAUDE.md`, `packages/{app,core,db,ui}/AGENTS.md`, `packages/{core,db,ui}/CLAUDE.md`, `README.md` § For AI agents, `.github/CODEOWNERS` (package agent files owned).

## Second cut (2026-11-16)

Owner decision 2026-11-16 (answers the "Working principles" open question): the detailed `.ai/` workflow and the working principles leave the root file; it keeps one short block with what nearly every task needs. Test per line: "would the agent do it differently without it"; per section: "for what share of tasks is it needed" — under ~50% moves out to a routed file.

| Root `AGENTS.md` | Before | After | Δ |
|---|---|---|---|
| Lines | 102 | 70 | −32 |
| Directives (analyzer) | 86 | 61 | −25 |
| Est. tokens (`analyze.py`, ≈ chars/4) | 3,166 | 2,159 | −32% |
| Claude-calibrated tokens (Context Scope) | 6,093 (owner's scan after the first cut) | ≈ 4,155 (estimate: 6,093 × 2,159 / 3,166) | ≈ −32% |
| Project-noun ratio | 0.83 | 0.85 | ≈ |

New on-demand file `.ai/README.md` ("AI workspace and workflow"): 31 lines, est. 985 tokens, read only through the router rows (Spec writing/updating, Lessons/run logs, Workflow/process). Context Scope re-measure after new sessions: owner.

### Moved to `.ai/README.md`

- § AI workspace: the `.ai/` layout bullets (`specs/` + `implemented/` + `archive/`, `runs/`, `context/`, `lessons.md` + `lessons/`) and the `YYYY-MM-DD-slug.md` naming rule — verbatim.
- § Mandatory workflow steps 1–6 (before any task, specs with statuses, after implementing a spec, autonomous run logs, lessons, before reporting done) — verbatim.
- § Working principles: plan first / re-plan, verify with evidence, review before PR, turn corrections into rules, use subagents, automate repeats (`.agents/skills` + symlink, `om-*` installed with `npx skills add`, customized via `.ai/skills/<name>/SKILL.md`) — trimmed as listed below. "Fix bugs from evidence" was already cut in the first pass (model default) and is not re-added.

Root keeps one paragraph (§ AI workspace): artifacts live in `.ai/` (skills' specs go to `.ai/specs/`), read `.ai/lessons.md` before any task, non-trivial changes start from an approved spec, autonomous runs keep a log in `.ai/runs/`, update lessons and spec status before done, details in `.ai/README.md`. Router: `.ai/README.md` added to Spec writing/updating and Lessons/run logs; new row "Workflow/process (specs lifecycle, run logs, skills)".

### Other root sections re-checked

Stack, Packages, Domain concepts, the 100% coverage / tests-next-to-code / integration-test rules and the whole security section (lesson 09, spec R2) pass the test and stay. Trimmed or cut:

> **AGENTS.md L13 (clause, trimmed)** — every `AGENTS.md` within its line budget (root 150, package 120), every path it names exists, every `CLAUDE.md` is only `@AGENTS.md`.

Now "budgets and paths of every `AGENTS.md`/`CLAUDE.md`"; the exact limits are in the script output and the spec.

> **AGENTS.md L40 (clause, trimmed)** — : lint + typecheck, unit tests with coverage, build without a DB, audit, integration tests, values outside tokens, Storybook tests.

The job list is in `.github/workflows/ci.yml`; the rule "all jobs must be green before merging" stays.

> **AGENTS.md L49 (moved to router)** — - Decisions, allowlist reasons, audit results and known hook gaps: `.ai/specs/implemented/2026-11-15-agent-workshop-hardening.md` and `.ai/security-notes.md`.

A pointer, not a rule; both files are already in the "Agent config/skills/security" router row.

> **AGENTS.md L99–102 (cut)** — | `packages/app` | `packages/app/AGENTS.md` | · | `packages/core` | `packages/core/AGENTS.md` | · | `packages/db` | `packages/db/AGENTS.md` | · | `packages/ui` | `packages/ui/AGENTS.md`, `docs/design-system.md` |

Duplicates the router sentence "for code in a package, also that package's `AGENTS.md`"; `docs/design-system.md` is in the "UI screen/component" row.

### Cut from the moved text, verbatim

> **AGENTS.md L73 (clause)** — `npm run validate`, and

Duplicate of § Commands ("Run it before review"). Principle renamed "Verify with evidence"; `npm run dev` now notes owner approval (it is in `permissions.ask`).

> **AGENTS.md L75 (clause)** — update this file instead.

Reworded: "update the root `AGENTS.md` (or the package `AGENTS.md` it concerns) instead" — "this file" would now point at `.ai/README.md`.

> **AGENTS.md L76 (clause)** — to keep the main context focused

Rationale, not a directive.
