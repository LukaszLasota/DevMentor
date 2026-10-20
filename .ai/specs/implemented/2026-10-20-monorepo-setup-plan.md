# Monorepo setup — plan

Spec: [2026-10-20-monorepo-setup.md](2026-10-20-monorepo-setup.md)
Branch: `feature/monorepo-setup`

## Phase 1 — Workspace and package skeleton ✅

- Root `package.json` with `workspaces`, delegating scripts (`dev`, `build`, `start`, `lint`, `typecheck`, `db`); shared `tsconfig.base.json`.
- Next.js app moved to `packages/app` (git history kept via `git mv`); `@devmentor/core`, `@devmentor/db`, `@devmentor/ui` created with TS-source `exports`.
- Root `.gitignore` adjusted for nested `.next/`, `node_modules/`.

Done when: `npm install` links all `@devmentor/*` packages; `npm run build` passes from the root; existing home page renders unchanged.

## Phase 2 — Database package (MikroORM) ✅

- `packages/db`: runtime config (`DATABASE_URL`, pool), single ORM instance per process, `registerDb(container)`, `server-only` entry; CLI config with migrator; migrations folder.
- Root `.env` shared by Next.js (`loadEnvConfig` in `next.config.ts`) and the CLI; `.env.example`.

Done when: `npm run db -- debug` finds the config and connects; `migration:create`, `migration:up`, `migration:down` work against PostgreSQL.

## Phase 3 — DI composition root (Awilix) ✅

- `packages/app/server/container.ts`: container built once, `createRequestScope()` with a forked `EntityManager` per request.
- `GET /api/health` resolves `em` from the request scope and runs `select 1`.

Done when: `/api/health` returns `{"status":"ok","database":"up"}` with a database, `503` without one.

## Phase 4 — UI package and route groups ✅

- `packages/ui`: shadcn/ui set up manually (theme in `src/styles.css`, `components.json`), `Button` added via CLI and exported.
- Separate root layouts: `app/(site)` (Tailwind, original home page) and `app/(admin)` (shadcn theme), `/admin` page using `@devmentor/ui`.

Done when: `/` renders the original page; `/admin` renders shadcn buttons with theme styles.

## Phase 5 — Docs and agent rules ✅

- `AGENTS.md`, `CLAUDE.md` (imports root and `packages/app/AGENTS.md`), `README.md` updated to the real layout; lessons recorded.

Done when: docs describe the actual layout and commands; no "target layout" notes remain.

## Phase 6 — Delivery ⏳

- Commit on `feature/monorepo-setup`, push, open PR to `main` (needs the user's approval).

Done when: PR is open and CI (if configured) is green.

## Progress log

- 2026-10-20 — Phases 1–5 implemented. Checks: lint, typecheck, build pass; dev smoke test of `/`, `/admin`; DB checks against a temporary PostgreSQL 17 container.
- 2026-10-20 — Review against "keep existing behaviour": home page had been replaced with a placeholder; restored the original `page.tsx`. Re-ran all checks (see below).
  - `npm ci` (clean) links all `@devmentor/*` workspaces; `npm run lint` ✅, `npm run typecheck` ✅ (0 errors), `npm run build` ✅ (`/`, `/admin` static, `/api/health` dynamic).
  - Temporary PostgreSQL 17: `db -- debug` connects; blank `migration:create` → `up` → `down` ✅ (test migration removed).
  - `npm run dev`: `/` 200 with the original page, `/admin` renders shadcn `Button` variants, `/api/health` → `{"status":"ok","database":"up"}` ✅.
- Next: Phase 6 (commit + PR) after the user's approval.
