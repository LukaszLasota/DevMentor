# Engineering standards — implementation plan

Spec: [2026-09-01-engineering-standards.md](2026-09-01-engineering-standards.md)
Branch: `feature/engineering-standards`

## Decisions (user, 2026-10-20)

- Dependency direction per spec: `app → core → db`; DI container and services in `core`; `ui` standalone (does not import `core`).
- Scope now: the foundation (spec §5 step 2 + §3) **without** `auth.ts` — it lands with the auth concept (YAGNI).
- App layout: `packages/app/src/app`; `(site)` → `(marketing)`; `(admin)` stays for the shadcn panel. Persona groups `(auth)`, `(student)`, `(mentor)` appear with their first page.

## Adaptations to this repo

- Files the spec migrates (`user.entity.ts`, `mentor-profile.entity.ts`, `user.service.ts`, `/admin/users`, `docs/product-scope.md`) do not exist here → spec §5 steps 1, 3 (users example) and 8 are not applicable; `/api/health` is the reference example instead.
- `export const dynamic = "force-dynamic"` is removed in Next 16 with `cacheComponents`; uncached DB access already runs at request time. Rule becomes: no `dynamic` config, no `use cache` around DB reads, and the build must pass with no database reachable.
- `ServiceUnavailableError` (503) added to the error hierarchy to keep `/api/health` semantics.

## Phase 1 — Layout and dependency direction ✅

- Move `packages/app/app` → `packages/app/src/app`; rename `(site)` → `(marketing)`.
- `db` becomes a leaf: no `@devmentor/core`/`awilix`; config built from explicit options; exports ORM types so nobody else imports `@mikro-orm/*`.
- DI container moves to `core/src/container/{container,cradle}.ts`; `app/server/container.ts` removed; `app` stops depending on `db`.
- One root ESLint config: `no-restricted-imports` per package (`core` ✗ next/react/@mikro-orm/ui/app; `db` ✗ core/ui/app/next/react; `ui` ✗ core/db/app/@mikro-orm; `app` ✗ db/@mikro-orm), `no-explicit-any` as error.

Done when: lint (incl. a deliberate violation being reported), typecheck, build pass; `/`, `/admin`, `/api/health` behave as before.

## Phase 2 — Core foundation ✅

- `core/src/config/env.ts` (zod-validated env), `core/src/logger.ts` (pino, secrets redacted).
- `core/src/http/`: `errors.ts`, `apiHandler.ts` (JSON envelope, CSRF header check on mutations, request scope), `makeCrudRoute.ts`, body/query parsing via zod.
- `HealthService` in `core/src/services/health/`, `/api/health` rewritten with `apiHandler`.
- Vitest set up at the root; unit tests for errors/envelope, `apiHandler`, `makeCrudRoute`, env.

Done when: tests pass; `/api/health` returns the envelope (`ok`/`503`) with and without a DB; build passes without a DB.

## Phase 3 — UI backend layer ✅

- shadcn primitives via CLI: `input`, `label`, `table`, `textarea`, `checkbox`.
- `ui/src/backend/`: `api/apiCall.ts` (+ `types.ts`), `feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx`, `tables/DataTable.tsx`, `forms/CrudForm.tsx`.
- Tests (jsdom + Testing Library) for `apiCall`, `DataTable`, `CrudForm`.
- `/admin` uses `apiCall` + `DataTable` + feedback components to show the health check (reference usage).

Done when: tests pass; `/admin` renders the health row in dev with and without a DB.

## Phase 4 — Rules, docs, validation gate ✅

- `AGENTS.md`: spec §3 (concept convention, reusable API & UI layer) adapted to real paths; dependency table, DI, DB, UI sections updated.
- `README.md` architecture updated; spec gets an "Adaptation notes" section and status.
- `npm run validate` = lint + typecheck + test + build + audit (`scripts/audit.mjs` with an explicit allowlist for advisories without a patched release).
- Lessons recorded.

Done when: `npm run validate` passes from a clean install.

## Phase 5 — Delivery ✅

- Commit, push, PR to `main`; the user merges.

## Progress log

- 2026-10-20 — Phase 1: app moved to `src/app`, `(site)` → `(marketing)`; `db` is a leaf (`getOrm(options)`, re-exported ORM types); container in `core/src/container`; root ESLint with boundaries — 7 deliberate violations (next/@mikro-orm/any in core, core in db, core in ui, db/@mikro-orm in app) all reported.
- 2026-10-20 — Phase 2: env (zod), logger (pino + redaction), `core/http` (errors, envelope, parse, `apiHandler` with CSRF, `makeCrudRoute`), `HealthService`; `/api/health` → `apiHandler`. 29 core tests. Dev: 503 envelope + warn log without DB, 200 after PostgreSQL starts.
- 2026-10-20 — Phase 3: shadcn input/label/table/textarea/checkbox via CLI; `apiCall`, feedback, `DataTable`, `CrudForm`; 18 ui tests (jsdom). `/admin` `HealthPanel` checked in headless Chromium: table "Database up" with DB, error + "Try again" without.
- 2026-10-20 — Phase 4: `AGENTS.md`, `README.md`, spec "Adaptation notes", `.env.example`, lessons; `npm run audit` gate (`scripts/audit.mjs` + `audit-allowlist.json`, verified to fail without the allowlist entry).
- 2026-10-20 — Final verification from `npm ci` with no `.env`/DB: `npm run validate` ✅ (lint, typecheck, 47 tests, build — `/api/health` dynamic, audit). `npm start`: `/` original page; `/api/health` 503 → 200 once PostgreSQL 17 is up; `/admin` panel shows "Database up"; MikroORM CLI `migration:create`/`up`/`down` ✅.
- 2026-10-20 — Phase 5: committed, PR opened against `main`; merge by the user.
- Next: spec §5 steps 4–6 apply per feature (events, validators, concepts) — start with a spec for the first concept (likely auth, which also brings `core/http/auth.ts`).
