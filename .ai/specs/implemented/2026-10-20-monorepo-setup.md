# Monorepo setup

Status: implemented

## Goal

Convert the single create-next-app project into an npm-workspaces monorepo with packages `app`, `core`, `db`, `ui`, wired according to the architecture rules in `AGENTS.md`.

## Scope

- Root `package.json` with `workspaces: ["packages/*"]`, shared scripts (`dev`, `build`, `lint`, `typecheck`) delegating to workspaces.
- Shared `tsconfig.base.json` (strict); each package extends it.
- `packages/app` (`@devmentor/app`) — current Next.js app moved here (`app/`, `public/`, `next.config.ts`, ESLint config); route groups `app/(site)` and `app/(admin)` with placeholder pages.
- `packages/core` (`@devmentor/core`) — empty public entry, no React/Next/MikroORM deps.
- `packages/db` (`@devmentor/db`) — MikroORM 7 + `@mikro-orm/postgresql`, config reading `DATABASE_URL` with pool settings, migrations folder + CLI scripts (`migration:create`, `migration:up`), `registerDb(container)`, `server-only` entry, one ORM instance per process (cached on `globalThis` in dev).
- `packages/ui` (`@devmentor/ui`) — shadcn/ui initialised (CLI), Tailwind 4, one sample component (`Button`) used in an admin page.
- Awilix composition root in `packages/app` (server-only): singleton ORM, request scope with forked `EntityManager`.
- `next.config.ts`: `transpilePackages` for internal packages, MikroORM in `serverExternalPackages`.
- `.env.example` with `DATABASE_URL`; README "Getting started" updated (Postgres setup, migrations).

## Out of scope

- Domain entities and business features.
- Authentication, admin access control.
- Docker/DDEV for Postgres, CI/CD, tests framework.

## Requirements

- Dependency direction exactly as in `AGENTS.md`; no cross-package relative imports.
- `AGENTS.md` Next.js managed block stays at the repo root and keeps working (`next dev` run from `packages/app` must not create a conflicting file — verify).
- Uses the latest stable versions: Next 16, React 19, MikroORM 7, Awilix 13, Tailwind 4, shadcn CLI 4.

## Acceptance criteria

- `npm install`, `npm run lint`, `npm run build` and typecheck pass from the root.
- `npm run dev` serves `/` (original home page, Tailwind only) and `/admin` (shadcn `Button` from `@devmentor/ui`).
- With a local Postgres and `DATABASE_URL` set, `migration:create` and `migration:up` work, and a route handler resolving the `EntityManager` from the request scope connects successfully.
- `README.md` and `AGENTS.md` match the resulting layout (remove the "target layout" note).

Plan: [2026-10-20-monorepo-setup-plan.md](2026-10-20-monorepo-setup-plan.md)

## Resolved questions

- Entity definition style: `defineEntity` + `setClass` (recommended by the MikroORM 7 README).
- `AGENTS.md`: `next dev` writes its managed blocks into the app directory, so they live in `packages/app/AGENTS.md`; project rules stay in the root `AGENTS.md`. Root `CLAUDE.md` imports both.

## Implementation notes

- Env files live at the repo root; `next.config.ts` (via `@next/env`) and the MikroORM CLI config load the root `.env`.
- Turbopack transpiles workspace packages automatically, so `transpilePackages` is not needed.
- Verified 2026-10-20: lint, typecheck, build pass; `/` and `/admin` render in dev; against a temporary PostgreSQL 17 container, `migration:create --blank`, `migration:up`/`down` and `/api/health` (`em` resolved from the request scope) work.
