# Execution plan: `npm run setup` (implementation)

Source doc: .ai/specs/2026-10-21-npm-run-setup.md (spec PR #13)
Issue: #12
Run log: .ai/runs/2026-10-21-npm-run-setup.md (spec PR #13)

## Goal

Ship `npm run setup`: an idempotent, dependency-free Node installer for README "Getting started", with README/AGENTS.md updates.

## Scope

- `scripts/setup.mjs` (entry), `scripts/lib/setup.mjs` (logic, injected deps), tests for both; root `package.json` script.
- README "Getting started", `AGENTS.md` root-scripts line.
- **Non-goals:** containerizing the app, CI/production setup, seed data, installing Node/Docker, starting `npm run dev`, any change in `packages/*`.

## Implementation Plan

### Phase 1: `npm run setup`

1.1 Step runner, Node check, entry and `setup` script.
1.2 Dependencies (lockfile-hash stamp) and `.env` (copy + missing-key warning) steps.
1.3 PostgreSQL (effective `DATABASE_URL`, TCP probe, compose health, `up -d --wait`) and migrations steps; next-steps output.
1.4 Docs: README and `AGENTS.md`.
1.5 Verification: full validation gate; manual fresh-clone, re-run and Docker-stopped checks recorded in the spec.

## Risks

- Real Docker/npm behaviour is only exercised manually (step 1.5); unit tests use injected fakes.
- Windows spawning is untested on Windows itself.

## Progress

PR: #14

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: npm run setup

- [x] 1.1 Step runner, Node check, entry and setup script — dfec01f
- [x] 1.2 Dependencies and .env steps — dfec01f
- [x] 1.3 PostgreSQL and migrations steps — dfec01f
- [x] 1.4 Docs: README and AGENTS.md — 7032541
- [x] 1.5 Verification

## Verification (2026-10-21)

- Gate: `lint`, `typecheck`, `test:coverage` (100%, 154 tests), `build`, `audit`, `test:integration` — all exit 0.
- Fresh worktree, run 1: Node ✓, Dependencies installed ✓, `.env` created ✓, PostgreSQL ↷ (existing server on `localhost:5432`), Migrations ✓, exit 0.
- Run 2: Dependencies ↷, `.env` ↷, PostgreSQL ↷, Migrations ✓ (no-op), exit 0 — nothing changed.
- No Docker on `PATH`: `✗ PostgreSQL — Docker Compose v2 is not available` + native-PostgreSQL hint, exit 1.
- Real `docker compose ps --format json postgres` output of the running container parses as healthy.
- After setup, `npm run dev` (port 3100): `/api/health` → `{"ok":true,"data":{"database":"up"}}`.
- Not exercised: the `docker compose up -d --wait` start path on this machine (port 5432 was taken by the developer's running container; stopping it was out of bounds) — covered by unit tests only. Windows not tested.
