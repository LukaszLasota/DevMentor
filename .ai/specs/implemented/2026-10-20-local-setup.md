# Local setup without the sandbox

Status: implemented

## Goal

A developer can run the project on their own machine following the course steps: clone → `npm install` → `docker compose up postgres` (or native PostgreSQL) → `cp .env.example .env` → migrations via a `package.json` script → `npm run dev` on port 3000.

## Scope

- `docker-compose.yml` with a `postgres` service (PostgreSQL 17, credentials matching `.env.example`, named volume, healthcheck).
- Root script `npm run db:migrate` (= MikroORM `migration:up`).
- README "Getting started" and `AGENTS.md` updated.

## Out of scope

- Containerizing the app itself; production database setup; seed data.

## Acceptance criteria

- From a fresh clone, the course steps work verbatim; `/api/health` returns `{"ok":true,"data":{"database":"up"}}`.
- `npm run db:migrate` succeeds on an empty database (no migrations committed yet).

## Verification (2026-10-20)

Course steps run verbatim on a fresh clone (`git clone` → `npm install` → `docker compose up -d postgres` → `cp .env.example .env` → `npm run db:migrate` → `npm run dev`):

- First run found a real bug: `/api/health` → 500 `Invalid environment … DATABASE_URL`. `next.config.ts` called `loadEnvConfig(root)`, but `@next/env` returns its cached result from Next's earlier load of the app dir, so the root `.env` was never read. Earlier checks passed `DATABASE_URL` on the command line and missed it.
- Fix: force the reload (`loadEnvConfig(root, dev, console, true)`) and add the parsed values to Next's initial snapshot (`updateInitialEnv(parsedEnv)`) so env reloads keep them.
- After the fix: `npm run db:migrate` ✅ (no migrations yet), `npm run dev` → `/` 200, `/api/health` `{"ok":true,"data":{"database":"up"}}` (also after editing `.env`), `/admin` "Database up" in headless Chromium; `npm run build` + `npm start` → health 200.
