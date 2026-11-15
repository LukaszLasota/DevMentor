# DevMentor — architecture rules

These decisions are fixed. Do not introduce alternatives (other ORMs, DI libraries, CSS or component frameworks) without the user's approval. Architecture overview for humans: `README.md`. Full engineering standards (naming table, principles, security minimums, review checklist): `.ai/specs/2026-09-01-engineering-standards.md` — follow it; this file is the short version.

Next.js-specific agent rules live in `packages/app/AGENTS.md` — that file is managed by `next dev` (it writes into the app directory); do not edit its marked blocks.

## Stack

- Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript (`strict`, no `any`).
- PostgreSQL + MikroORM 7 (`@mikro-orm/postgresql`) — entities, migrations, connection pool.
- Awilix — dependency injection container. Zod 4 — validation and env. pino — logging.
- Tailwind CSS 4 — public pages; shadcn/ui — admin (backend) pages.
- Vitest + `@vitest/coverage-v8` (jsdom + Testing Library for React) — unit tests; testcontainers (PostgreSQL) + `agent-browser` — integration tests; GitHub Actions — CI.
- Monorepo on npm workspaces; packages live in `packages/`, named `@devmentor/<name>`, consumed as TypeScript source (no build step; Turbopack transpiles them).
- Root scripts: `npm run setup` (idempotent local setup), `npm run dev | build | lint | typecheck | test | test:coverage | test:integration | audit`, `npm run validate` (all gates except integration), `npm run db:migrate`, `npm run db:seed` (dev demo accounts), `npm run db -- <mikro-orm command>`. Install deps into a package with `npm install <dep> -w @devmentor/<name>`.

## Packages and dependency direction

`app → core → db`; `ui` is standalone and imported by `app` only. Enforced by `no-restricted-imports` in the root `eslint.config.mjs` — never loosen it for convenience.

| Package | Contents | May import |
|---|---|---|
| `packages/app` | Next.js app (`src/app`): pages, route handlers — HTTP/rendering only | `core`, `ui` |
| `packages/core` | Services (business rules), DI container, `http/` API layer, env, logger, events, validators | `db` |
| `packages/db` | MikroORM config, entities, migrations, seeders | nothing internal |
| `packages/ui` | React components: shadcn primitives, panel layer `backend/`, concept components | nothing internal |

- Only `db` imports `@mikro-orm/*`; others use the types `@devmentor/db` re-exports (`EntityManager`, `MikroORM`).
- `core` and `db` never import `next`/`react`. `ui` never imports `core` — shared shapes (API envelope, CSRF header) are mirrored in `ui/src/backend/api/types.ts`; keep both in sync. A shared package for them is an Ask First change.
- Import packages through their public entries (`@devmentor/core`, `@devmentor/core/http`, `@devmentor/ui`), never relative paths into another package. The `@devmentor/core` and `@devmentor/core/http` entries are server-only; client-safe shared Zod schemas live in `@devmentor/core/validators` (`packages/core/src/validators/`), which client components in `app` may import — it imports only `zod` and its own files (ESLint + `validators/index.test.ts`). `ui` still never imports it: `CrudForm` takes the schema as a prop.

## Domain concept convention

Domain code is not organized into `modules/`. Each concept (`auth`, `mentors`, `availability`, `bookings`, `payments`, `messages`, `favorites`, `reviews`, ...) is a same-named sub-folder repeated across the layers that need it:

- `packages/db/src/entities/<concept>/<name>.entity.ts` (registered in `entities/index.ts`)
- `packages/core/src/services/<concept>/<name>.service.ts` (registered in `container.ts` + `cradle.ts`)
- `packages/core/src/validators/<concept>/<name>-<action>.schema.ts` (shared Zod schemas)
- `packages/app/src/app/api/<concept>/route.ts` and pages under the persona route group
- `packages/ui/src/components/<concept>/` for concept-specific shared components

Create a concept folder only when its first file is added — never scaffold empty ones. This is a directory convention, not a module runtime: no per-concept setup/ACL/auto-discovery. Event IDs follow `concept.entity.action` (e.g. `bookings.booking.created`), emitted through the typed in-process emitter in `packages/core/src/events` (added with the first feature that needs it; no queue/worker in this project). Step-by-step recipe: spec §2.

## Reusable API & UI layer

Every route and page reuses these instead of re-implementing fetch/validation/auth/error handling:

- `packages/core/src/http/` (`@devmentor/core/http`):
  - `errors.ts` — `AppError` + `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError` (429; its `headers` — `Retry-After` — and `retryAfterSeconds` reach the response), `ServiceUnavailableError`. Services throw these; they never build responses. Recognise them with `isAppError`/`isValidationError`, never `instanceof` — server bundles have separate copies of the classes while the container is shared.
  - `apiHandler.ts` — wraps every route handler: CSRF header check on POST/PUT/PATCH/DELETE (`csrf: false` only for third-party webhooks), request scope (`cradle`), JSON envelope `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`, maps `AppError`/`ZodError`, logs unexpected errors without leaking them. `headers` option: extra headers on every response (e.g. `Cache-Control: no-store`). No route writes its own `try/catch` or `NextResponse.json`.
  - `makeCrudRoute.ts` — plain CRUD resource: `export const { GET, POST, PUT, DELETE } = makeCrudRoute({ service, createSchema, updateSchema })`; record id as `?id=<uuid>`. Workflow endpoints (booking, payment, reschedule) use `apiHandler` directly.
  - `parse.ts` — `parseJsonBody`, `parseSearchParams`, `parseWith`: always pass the schema's parsed output to services, never the raw body (no mass assignment).
  - `auth.ts` — `requireSession(req, cradle)` (401 unless the live session check in `core/src/auth/session-user.ts` passes: token, `session_version`, stored roles, `OPERATOR_EMAILS`) and `requireRole(user, ...roles)` (403, fail closed). Pages use `packages/app/src/lib/session.ts` (`requirePageSession(path)`, `requirePageRole(path, ...roles)`, `homeFor`) in every guarded layout **and** page. Ownership assertions arrive with the first owned resource; `makeCrudRoute` has no auth hook yet, so it is for public resources only.
- `packages/ui/src/backend/` (`@devmentor/ui`): `api/apiCall.ts` (`apiCall`/`apiCallOrThrow` — the only sanctioned `fetch()` to `/api/*`), `forms/CrudForm.tsx` (schema-driven form, every create/edit form), `tables/DataTable.tsx` (every list), `feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx` (the only loading/error/empty renderers). Reference usage: `packages/app/src/app/(admin)/admin/HealthPanel.tsx`.

New reusable components have one home each:

1. shadcn primitive → `ui/src/components/ui/` via `npx shadcn@latest add <name>` (run in `packages/ui`), never hand-written.
2. Generic, concept-agnostic panel pattern → `ui/src/backend/<category>/`.
3. Component tied to one concept's domain shape → `ui/src/components/<concept>/`.
4. Used by exactly one page → colocate next to that `page.tsx` until a second consumer appears.

## Dependency injection (Awilix)

- One container per process: `packages/core/src/container/container.ts`; its shape: `cradle.ts`. Every dependency is registered by hand (no `loadModules`) — a new service is one line in each file.
- Services get dependencies through the constructor (PROXY mode: one destructured object) and never import singletons or call `container.resolve`.
- Lifetimes: `env`, `logger`, `orm` singletons; `em` (`orm.em.fork()`) and services using it `scoped`. Routes get `cradle` from `apiHandler`; pages/server actions use `withScope((cradle) => ...)`.

## Database (MikroORM)

- Entities with `defineEntity` + `setClass` (MikroORM 7, no decorators), UUID primary keys, snake_case plural tables.
- Local database: `docker compose up -d postgres` (credentials match `.env.example`). Schema changes only via committed migrations (`npm run db -- migration:create`, apply with `npm run db:migrate`). Never edit an applied migration; never use `schema:update` outside local experiments.
- Env: root `.env` (template `.env.example`), loaded by `next.config.ts` and the CLI config, validated by `core/src/config/env.ts` (zod) — add new variables there. `db` receives options explicitly (`getOrm(options)`); only its CLI config (`packages/db/src/mikro-orm.config.ts`) reads `process.env` itself.
- One `MikroORM` instance per process (cached on `globalThis`); never use the global `EntityManager`.
- No `export const dynamic` (removed with `cacheComponents`) and no `use cache` around DB reads: uncached DB access runs at request time. The app must build and boot with no database reachable — check `npm run build` without a DB.
- Check-then-write on shared state (slots, booking status) runs in one transaction in the service, backed by a unique constraint. No raw SQL with interpolated input.

## UI

- **Design system:** read `docs/design-system.md` before building any screen; components, tokens and rules are documented in the Storybook in `packages/ui` (`npm run storybook -w @devmentor/ui`). Use semantic tokens only (`npm run check:tokens`). Interface language: English.
- `packages/app/src/app/(marketing)` — public pages, Tailwind only (no shadcn). `(auth)` (sign-in, register, verify email), `(admin)` and the persona groups `(mentee)` and `(mentor)` — panel surface, shadcn/ui via `@devmentor/ui`. A group is created with its first page; the mentee persona group is `(mentee)`, not `(student)`. Each group that needs its own `<html>` has its own root layout; there is no `src/app/layout.tsx`.
- Guarded pages: the layout and every `page.tsx` of a guarded group call `requirePageSession(path)` / `requirePageRole(path, ...roles)` (`packages/app/src/lib/session.ts`) inside `<Suspense>`; the session read lives in a colocated async component, not in `page.tsx` (Next allows only its own exports there). Role homes render `RoleNotice` with the `notice` search param.
- Signed-in shell: every signed-in root layout (`(mentee)`, `(mentor)`, `(admin)`) renders `AppShell` of `@devmentor/ui` with `header={<AccountHeader />}` and `nav={<AccountNav />}` (`packages/app/src/components/account/`: the `AccountBar`, and the role sidebar `SideNav` + `accountNavSections`), each inside `<Suspense>` — behind the layout guard where there is one; both render nothing without a session. The session is read on the server; only the current-item check runs in the client `ShellNav` (`usePathname`). Sidebar links go only to pages that exist — a new area page adds its item to `accountNavSections`. Session reads are memoized per request, so guards, header and sidebar share one check.
- Admin theme: `packages/ui/src/styles.css`, imported by the admin root layout.

## Quality gates

- **100% unit test coverage is mandatory.** Every new feature and every change ships with unit tests that keep coverage at 100% for statements, branches, functions and lines. `npm run test:coverage` enforces it (thresholds in `vitest.config.mts`) and CI fails below 100%. Do not lower the thresholds, and do not add coverage exclusions (`coverage.exclude`, `/* v8 ignore */`, `/* istanbul ignore */`) without the user's explicit approval — make code testable instead (inject dependencies, split side effects into a thin entry).
- Unit tests live next to the code (`*.test.ts(x)`, `scripts/**/*.test.mjs`). A behaviour change ships with a test that fails without it; a bug fix with a regression test.
- Integration tests (`packages/app/integration/`, `npm run test:integration`, needs Docker) run the production build against a throwaway PostgreSQL from testcontainers and drive pages with `agent-browser` (wrapper: `integration/agent-browser.ts`). Add one for every flow that crosses HTTP + DB + UI.
- CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: lint + typecheck, unit tests with coverage, build without a DB, audit, integration tests. All jobs must be green before merging.
- Run `npm run validate` locally before review (lint, typecheck, coverage, build, audit), plus `npm run test:integration` when HTTP/DB/UI behaviour changes. `npm run audit` fails on high/critical advisories not listed in `audit-allowlist.json` (each entry: reason + `reviewBy` date).
- Security minimums and the review checklist (auth server-side, ownership checks, fail closed, no secrets in logs/responses, rate limiting on auth endpoints): engineering standards spec §1.

## Agent workshop security

- **Agent config is code.** `.claude/`, `.agents/`, `.codex/`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `packages/app/AGENTS.md`, `skills-lock.json` and `.github/workflows/` are owned in `.github/CODEOWNERS`; changes to them go through the owner's review like any other code.
- **Never read secrets.** Do not open `.env` / `.env.*` (only `.env.example` is readable), `*.pem`, `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.qodo`, `~/.kube` or session history in `~/.claude/projects` — not with Read, not through any command. Do not try to work around a block: ask the user.
- **The sandbox and the hook are quality gates.** `.claude/settings.json` (`permissions.deny`, `sandbox` with the network allowlist and `denyRead`, `PreToolUse` hook) and `.claude/hooks/pre-tool-use.sh` (tests: `scripts/hooks/pre-tool-use.test.mjs`) apply to every session. Never weaken them (remove a deny rule, widen `allowedDomains`, add `excludedCommands`, turn the sandbox off, edit the hook to let more through) without the owner's explicit approval; a new domain or excluded command is added deliberately, with its reason recorded.
- **Owner-run and approved commands.** `npm run setup`, `npm run db:migrate`, `npm run db:seed` and `npm run invite` read `.env`, which the sandbox hides: ask the owner to run them (`!` prefix). `npm run dev`, `npm run test:integration`, `docker compose …` and `git push` run outside the sandbox and need the owner's approval each time (`permissions.ask`), because they execute code the agent may have changed.
- Decisions, allowlist reasons, audit results and known hook gaps: spec `.ai/specs/2026-11-15-agent-workshop-hardening.md` and `.ai/security-notes.md`.

# AI workspace (`.ai/`)

All AI-generated working artifacts live in `.ai/`. Using this structure is mandatory — do not keep specs, run logs or lessons anywhere else (no ad-hoc notes in the repo root, `docs/`, or private memory only).

```
.ai/
├── specs/                # Specs for spec-driven development (SDD) — active / in progress
│   ├── implemented/      # Specs that have been fully implemented
│   └── archive/          # Abandoned, superseded or obsolete specs
├── runs/                 # Logs of autonomous AI runs
├── lessons.md            # Index of lessons learned (long-term memory)
└── lessons/              # Detailed lesson write-ups linked from lessons.md
```

## Naming

Every file in `specs/`, `runs/` and `lessons/` is named `YYYY-MM-DD-slug.md`:
- `YYYY-MM-DD` — the date the file was created (do not rename when it is updated or moved),
- `slug` — short, lowercase, kebab-case description, e.g. `2026-10-20-user-login.md`.

## Mandatory workflow

1. **Before any task** — read `.ai/lessons.md` and every linked lesson relevant to the task. Check `.ai/specs/` for a spec covering the work.
2. **Specs (SDD)** — any non-trivial feature or change starts from a spec in `.ai/specs/`. Write it (or ask the user to approve it) before implementing. A spec contains at least: goal, scope / out of scope, requirements, acceptance criteria, and a status line (`Status: draft | approved | in-progress | implemented | archived`). Implement against the spec; if the implementation must diverge, update the spec first.
3. **After implementing a spec** — set `Status: implemented` and move the file to `.ai/specs/implemented/` (`git mv`, same filename). Specs that are dropped or superseded go to `.ai/specs/archive/` with a one-line reason at the top.
4. **Autonomous runs** — every autonomous / unattended AI run (loops, scheduled agents, multi-step runs without the user in the loop) creates one log `.ai/runs/YYYY-MM-DD-slug.md` at the start and keeps it updated. It records: goal, linked spec (if any), steps taken, decisions and why, commands/tests run with results, files changed, open issues, and final outcome. Several runs on one day with the same topic get distinct slugs (e.g. `-2`, `-retry`).
5. **Lessons** — after fixing a bug, discovering a non-obvious behaviour, a gotcha in tooling/framework, a user correction, or a workflow improvement, record it before finishing the task:
   - add a one-line entry to `.ai/lessons.md` (newest first),
   - if it needs context (root cause, repro, reasoning), also create `.ai/lessons/YYYY-MM-DD-slug.md` and link it from the entry.
   Do not record what is obvious from the code or git history. Fix or delete lessons that turn out to be wrong.
6. **Before reporting a task as done** — confirm the spec status/location, run log and lessons are up to date.

## Working principles

- **Plan complex work first** — for multi-step or multi-file tasks, plan before writing code (plan mode in Claude Code); the approved plan becomes or updates the spec. If implementation goes sideways, stop and re-plan instead of pushing through.
- **Verify every change** — run `npm run validate` and check UI changes in the running app (`npm run dev`). Never report done without evidence; if a check fails, say so.
- **Review before PR** — critically review your own diff before committing; if a solution is hacky, rewrite it cleanly now rather than leaving it.
- **Fix bugs from evidence** — start from the error message, failing check or logs, reproduce, find the root cause, then fix and verify; afterwards record the lesson (workflow step 5).
- **Turn corrections into rules** — when the user corrects you, record it as a lesson; if it is a general rule for this repo, update this file instead.
- **Use subagents** for broad searches and independent subtasks to keep the main context focused.
- **Automate repeats** — a task done repeatedly becomes a skill, shared by every agent: write it in `.agents/skills/<name>/SKILL.md` and symlink it for Claude Code (`ln -s ../../.agents/skills/<name> .claude/skills/<name>`). Installed collections (`om-*`, tracked in `skills-lock.json`) are installed with `npx skills add <source> -a claude-code -a codex` and never edited in place — customize an `om-*` skill with a repo-local `.ai/skills/<name>/SKILL.md` extension.
