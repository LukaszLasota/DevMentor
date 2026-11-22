# DevMentor

Mentoring platform: a Next.js app in an npm-workspaces monorepo (`packages/app`, `core`, `db`, `ui`) on PostgreSQL. This file holds the rules every task needs; before a task, read the files its row in **Task routing** names. Each package has its own `AGENTS.md` for rules that apply only there — read it before changing that package.

## Stack (fixed)

Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript (`strict`, no `any`); PostgreSQL + MikroORM 7; Awilix (DI); Zod 4 (validation, env); pino (logging); Tailwind CSS 4 (public pages) and shadcn/ui (signed-in panel pages); Vitest + `@vitest/coverage-v8`, testcontainers + `agent-browser`; GitHub Actions. Do not introduce alternatives (other ORMs, DI libraries, CSS or component frameworks) without the user's approval.

## Commands

- `npm run validate` — agent files, lint, typecheck, unit tests with coverage, build, audit (all gates except integration). Run it before review, plus `npm run test:integration` when HTTP/DB/UI behaviour changes.
- `npm run dev | build | lint | typecheck | test | test:coverage | test:integration | audit | check:tokens`; `npm run db -- <mikro-orm command>`.
- `npm run check:agents` — budgets and paths of every `AGENTS.md`/`CLAUDE.md`; run it after editing agent files.
- Install a dependency into one package: `npm install <dep> -w @devmentor/<name>`. Packages are consumed as TypeScript source (no build step; Turbopack transpiles them).

## Packages and dependency direction

`app → core → db`; `ui` is standalone and imported by `app` only. Enforced by `no-restricted-imports` in the root `eslint.config.mjs` — never loosen it for convenience.

| Package | Contents | May import |
|---|---|---|
| `packages/app` | Next.js app (`src/app`): pages, route handlers — HTTP/rendering only | `core`, `ui` |
| `packages/core` | Services (business rules), DI container, `http/` API layer, env, logger, events, validators | `db` |
| `packages/db` | MikroORM config, entities, migrations | nothing internal |
| `packages/ui` | React components: shadcn primitives, panel layer `backend/`, concept components | nothing internal |

- Only `db` imports `@mikro-orm/*`. `core` and `db` never import `next`/`react`. `ui` never imports `core`.
- Import packages through their public entries (`@devmentor/core`, `@devmentor/core/http`, `@devmentor/core/validators`, `@devmentor/ui`, `@devmentor/ui/mentors`), never relative paths into another package.
- Every route and page reuses the shared API & UI layer (`@devmentor/core/http`, `@devmentor/ui` panel layer) instead of re-implementing fetch, validation, auth or error handling — details in `packages/core/AGENTS.md` and `packages/ui/AGENTS.md`.

## Domain concepts

Domain code is not organized into `modules/`. Each concept (`auth`, `mentors`, `invitations`, `availability`, `bookings`, `payments`, ...) is a same-named sub-folder repeated across the layers that need it: `packages/db/src/entities/<concept>/`, `packages/core/src/services/<concept>/`, `packages/core/src/validators/<concept>/`, `packages/app/src/app/api/<concept>/` (+ pages in the persona route group), `packages/ui/src/components/<concept>/`. Create a concept folder only when its first file is added — never scaffold empty ones. It is a directory convention, not a module runtime: no per-concept setup/ACL/auto-discovery. Step-by-step recipe: engineering standards spec §2.

## Quality gates

- **100% unit test coverage is mandatory.** Every new feature and every change ships with unit tests that keep coverage at 100% for statements, branches, functions and lines. `npm run test:coverage` enforces it (thresholds in `vitest.config.mts`) and CI fails below 100%. Do not lower the thresholds, and do not add coverage exclusions (`coverage.exclude`, `/* v8 ignore */`, `/* istanbul ignore */`) without the user's explicit approval — make code testable instead (inject dependencies, split side effects into a thin entry).
- Unit tests live next to the code (`*.test.ts(x)`, `scripts/**/*.test.{mjs,mts}`). A behaviour change ships with a test that fails without it; a bug fix with a regression test.
- Every flow that crosses HTTP + DB + UI gets an integration test (`packages/app/integration/`, see `packages/app/AGENTS.md`).
- CI (`.github/workflows/ci.yml`) runs the gates on every pull request and push to `main`; all jobs must be green before merging.
- `npm run audit` fails on high/critical advisories not listed in `audit-allowlist.json` (each entry: reason + `reviewBy` date).

## Agent workshop security

- **Agent config is code.** `.claude/`, `.agents/`, `.mcp.json`, every `AGENTS.md` and `CLAUDE.md`, `skills-lock.json` and `.github/workflows/` are owned in `.github/CODEOWNERS` (full list there); changes to them go through the owner's review like any other code.
- **Never read secrets.** Do not open `.env` / `.env.*` (only `.env.example` is readable), `*.pem`, `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.qodo`, `~/.kube` or session history in `~/.claude/projects` — not with Read, not through any command. Do not try to work around a block: ask the user.
- **The sandbox and the hook are quality gates.** `.claude/settings.json` (`permissions.deny`, `sandbox` with the network allowlist and `denyRead`, `PreToolUse` hook) and `.claude/hooks/pre-tool-use.sh` (tests: `scripts/hooks/pre-tool-use.test.mjs`) apply to every session. Never weaken them (remove a deny rule, widen `allowedDomains`, add `excludedCommands`, turn the sandbox off, edit the hook to let more through) without the owner's explicit approval; a new domain or excluded command is added deliberately, with its reason recorded.
- **Owner-run and approved commands.** `npm run setup`, `npm run db:migrate`, `npm run db:seed` and `npm run invite` read `.env`, which the sandbox hides: ask the owner to run them (`!` prefix). `npm run dev`, `npm run test:integration` and `docker compose …` run outside the sandbox and need the owner's approval each time (`permissions.ask`), because they execute code the agent may have changed. `git push` runs outside the sandbox without a prompt (owner decision, 2026-11-22); merges stay with the owner.

## AI workspace (`.ai/`)

AI artifacts (specs, run logs, lessons) live in `.ai/` — not the repo root, `docs/` or an agent's private memory; specs from planning/brainstorming skills go to `.ai/specs/`. Before any task read `.ai/lessons.md` (and the lessons relevant to it); non-trivial changes start from a spec in `.ai/specs/`, approved before implementing; autonomous runs keep a log in `.ai/runs/`; update lessons and the spec status before reporting done. Details (spec lifecycle, naming, run logs, lessons, working principles, skills): `.ai/README.md`.

## Task routing

Read the files in the row before starting; for code in a package, also that package's `AGENTS.md`. Paths are relative to the repo root; `§` names a section.

| Task | Read |
|---|---|
| Bug fix | `.ai/lessons.md` (search the area), `.ai/lessons/2026-10-26-production-build-session-gotchas.md` (fails only in the production build), `.ai/lessons/2026-10-20-ci-and-coverage-gotchas.md` (fails only in CI) |
| New feature | its spec in `.ai/specs/`, `.ai/specs/2026-09-01-engineering-standards.md` §2, `SDLC.md` § Definition of Ready, `BACKWARD_COMPATIBILITY.md` |
| Refactor | `BACKWARD_COMPATIBILITY.md`, `.ai/specs/2026-09-01-engineering-standards.md` §1 (Architecture, Engineering Principles), `eslint.config.mjs` |
| Review | `CODE_REVIEW.md`, `.ai/specs/2026-09-01-engineering-standards.md` §1 (Security & Validation, Code Review Checklist), `BACKWARD_COMPATIBILITY.md` |
| Spec writing/updating | `.ai/README.md`, `SDLC.md` § Ticket lifecycle, `.ai/specs/product-brief.md`, `.ai/specs/backlog.md`, example: `.ai/specs/implemented/2026-10-21-mentor-invitations.md` |
| UI screen/component | `docs/design-system.md`, `packages/ui/AGENTS.md`, `packages/app/AGENTS.md`, `packages/ui/POSTEP.md` |
| Database/entity/migration | `packages/db/AGENTS.md`, `packages/core/AGENTS.md` § Services and DI (transactions) |
| API route | `packages/core/AGENTS.md` § HTTP layer, `packages/app/AGENTS.md`, `.ai/specs/2026-09-01-engineering-standards.md` §1 (Reusable API & UI Layer) |
| Auth/session/roles | `packages/core/src/http/auth.ts`, `packages/core/src/auth/session-user.ts`, `packages/app/src/lib/session.ts`, `.ai/specs/implemented/2026-10-21-sign-in-github-and-email.md`, `.ai/specs/2026-09-01-engineering-standards.md` §1 (Security & Validation) |
| Agent config/skills/security | `.ai/security-notes.md`, `.ai/specs/implemented/2026-11-15-agent-workshop-hardening.md`, `.github/CODEOWNERS`, `skills-lock.json`, `.ai/context/2026-11-16-no-op-report.md`, `.ai/context/2026-11-16-context-budget.md` |
| Tests/CI/coverage | `vitest.config.mts`, `.github/workflows/ci.yml`, `.ai/lessons/2026-10-20-ci-and-coverage-gotchas.md`, `packages/app/AGENTS.md` § Integration tests |
| Lessons/run logs | `.ai/README.md`, `.ai/lessons.md`, example run log: `.ai/runs/2026-10-26-epic-01-track.md` |
| Local setup/env | `README.md` § Getting started, `.env.example`, `packages/core/src/config/env.ts`, `.ai/lessons/2026-10-20-monorepo-tooling-gotchas.md` |
| Workflow/process (specs lifecycle, run logs, skills) | `.ai/README.md`, `SDLC.md` § Ticket lifecycle |
| Release/PR process | `SDLC.md`, `.ai/agentic.config.json` |
| Any change inside a package | that package's file: `packages/app/AGENTS.md`, `packages/core/AGENTS.md`, `packages/db/AGENTS.md`, `packages/ui/AGENTS.md` |
