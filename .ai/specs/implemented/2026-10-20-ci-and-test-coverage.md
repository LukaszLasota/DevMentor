# CI and test coverage

Status: in-progress
Branch: `feature/ci`

## Goal

Every pull request is checked automatically on GitHub: the app builds, lint and typecheck pass, unit tests pass with 100% coverage, and integration tests run the real app against a throwaway PostgreSQL (testcontainers) and drive it with `agent-browser`. All existing code is covered 100% by unit tests.

## Scope

- **Unit tests:** Vitest (already in place) + `@vitest/coverage-v8`; `npm run test:coverage` with 100% thresholds (statements, branches, functions, lines). Projects: `core`, `db`, `tooling` (node), `ui`, `app` (jsdom; node per file where needed).
- **Coverage scope:** `packages/*/src/**`, `packages/app/next.config.ts` (it has env-loading logic) and `scripts/**`. Excluded: tests, `*.d.ts`, generated migrations, tooling config without app logic (`eslint.config.mjs`, `vitest*.config.mts`, test setup/stubs).
- **Integration tests:** `vitest.integration.config.mts`, `packages/app/integration/`. Global setup starts `postgres:17-alpine` via `@testcontainers/postgresql`, runs `npm run db:migrate` against it, starts the production build (`next start`) on a free port, waits for `/api/health`. Tests: HTTP envelope, migrations table, `/admin` and `/` through `agent-browser`. `npm run test:integration` builds first.
- **CI:** `.github/workflows/ci.yml` on `pull_request` and pushes to `main`: jobs `lint` (lint + typecheck), `unit` (coverage), `build` (no DB, no `.env`), `audit`, `integration` (Docker on the runner + `agent-browser install --with-deps`).
- **Rule in `AGENTS.md`:** every new feature ships with 100% unit test coverage; no new coverage exclusions without the user's approval.
- Refactors needed for testability: `scripts/audit.mjs` split into a thin entry + `scripts/lib/audit.mjs`; unreachable branches removed (field-error flattening).

## Out of scope

- Deployment workflows, branch protection settings (repo admin action for the user), E2E tests beyond the existing pages.

## Acceptance criteria

- `npm run test:coverage` passes with 100/100/100/100.
- `npm run test:integration` passes locally (Docker) and in CI.
- The workflow runs on a PR and all jobs are green.

## Plan

1. Coverage tooling + thresholds; testability refactors. Done when: `test:coverage` reports per-file gaps.
2. Unit tests to 100% for core, db, ui, app, tooling. Done when: `test:coverage` passes.
3. Integration framework (testcontainers + `next start` + `agent-browser`) and first tests. Done when: `test:integration` passes locally.
4. CI workflow, `AGENTS.md` rule, README, lessons. Done when: PR checks are green.

## Progress log

- 2026-10-20 — Phase 1: `@vitest/coverage-v8`, projects core/db/ui/app/tooling, 100% thresholds; `scripts/audit.mjs` split into entry + `scripts/lib/audit.mjs`; unreachable field-error branches removed. Baseline: 68% lines.
- 2026-10-20 — Phase 2: unit tests for every file → 120 tests, 100% statements/branches/functions/lines (35 files; 6 type-only files have no runtime code). Lint + typecheck clean.
- 2026-10-20 — Phase 3: `vitest.integration.config.mts` + `packages/app/integration/` (testcontainers PostgreSQL 17, `npm run db:migrate`, `next start` on a free port, agent-browser wrapper). 5 tests pass in ~19 s incl. build; containers and browser sessions cleaned up; a deliberately wrong assertion fails the suite.
- 2026-10-20 — Phase 4: `.github/workflows/ci.yml` (lint+typecheck, unit coverage, build, audit, integration), 100% rule in `AGENTS.md`, README, lessons. `npm run validate` ✅ locally. Remaining: CI run on the PR.
