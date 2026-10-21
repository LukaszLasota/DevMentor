# One-command local setup (`npm run setup`)

Status: draft
Issue: #12

## 📝 TLDR

A developer setting up DevMentor locally runs five commands from README "Getting started" by hand. **Proposed:** one command, `npm run setup`, runs those steps in order, detects what is already done and skips it, so it is safe to re-run at any time (after a pull, on a half-finished setup). The manual commands stay in the README as the alternative.

## Resolved assumptions (autonomous defaults)

| # | Question | Default | Rationale |
|---|---|---|---|
| Q1 | How does setup support a native PostgreSQL instead of Docker? | Skip Docker when the effective `DATABASE_URL` (shell env, else `.env`, else `.env.example`) is not the default from `.env.example`, or when something already accepts connections on the default host/port. | No new flag or config; mirrors the README instruction "or a native PostgreSQL — then adjust `DATABASE_URL`" and avoids a port-5432 clash with a native server using default credentials. Reversible. |
| Q2 | Should setup start `npm run dev` at the end? | No — print the command and the URLs. | A long-running server would make the installer never terminate and break idempotent re-runs; smallest scope. |
| Q3 | Should `.env` be updated when `.env.example` gains new keys? | No writes — print a warning listing keys missing from `.env`. | Never touches a developer's secrets; surfaces drift after a pull. |

No assumption needs human confirmation.

## 📝 Problem Statement

- Onboarding (fresh clone, course participants) needs the exact order: deps → database → `.env` → migrations. Skipping one gives confusing failures, e.g. `ECONNREFUSED 127.0.0.1:5432` when PostgreSQL is not running, or `Invalid environment … DATABASE_URL` without `.env` (both seen in this repo — see `.ai/specs/implemented/2026-10-20-local-setup.md`).
- After a pull with new migrations or dependencies, developers must remember which steps to repeat.

## 📝 Proposed Solution

A dependency-free Node script (`node:` built-ins only, so it runs before `npm install`) wired as root script `"setup": "node scripts/setup.mjs"`. It runs an ordered list of steps; each step has a **check** ("already done?") and an **action**. Output is one line per step: `✓ <step> — done`, `↷ <step> — skipped (<reason>)`, or `✗ <step> — <error>` followed by the manual command to run instead; the first failure stops the run with exit code 1.

| # | Step | Already done when | Action |
|---|---|---|---|
| 1 | Node version | `process.versions.node` major ≥ 22 | fail with the README requirement |
| 2 | Dependencies | `node_modules/.devmentor-setup` holds the SHA-256 of the current `package-lock.json` | `npm install`, then write that stamp |
| 3 | `.env` | `.env` exists (then warn about keys missing vs `.env.example`) | copy `.env.example` → `.env` |
| 4 | PostgreSQL | effective `DATABASE_URL` is not the default (native DB, Q1) → skip; `docker compose ps --format json postgres` shows `Health: healthy` → skip; default host/port already accepts TCP connections (another PostgreSQL) → skip with a note | check `docker compose version` (Compose v2), then `docker compose up -d --wait postgres` (waits for the `pg_isready` healthcheck in `docker-compose.yml`) |
| 5 | Migrations | — (MikroORM `migration:up` is itself a no-op when nothing is pending) | `npm run db:migrate` |
| 6 | Next steps | — | print `npm run dev` and the three URLs from the README |

**Alternatives considered:**
- *Shell script (`setup.sh`)* — lost: not portable to Windows, and the repo's tooling is Node (`scripts/audit.mjs`).
- *Always run every command (no checks)* — `npm install` and `docker compose up` are mostly idempotent already, but re-runs would be slow and print noise; explicit checks make "skipped" visible, which is the stated requirement.
- *Make/Taskfile* — lost: adds a tool the README does not require.

**Prior art:** Rails `bin/setup` (idempotent, re-runnable, `bundle check || bundle install`, `db:prepare`) is the model; this spec keeps its shape and skips its extras (log/tmp cleanup, server restart).

## 📝 Architecture

- `scripts/setup.mjs` — one-line entry (`process.exitCode = await main()`; async because of the TCP probe), same pattern as `scripts/audit.mjs`, with its own `scripts/setup.test.mjs` like `scripts/audit.test.mjs` (coverage includes `scripts/**/*.mjs`).
- `scripts/lib/setup.mjs` — the logic: `main(deps)` with injected dependencies `{ run, fs, log, env, nodeVersion, probePort }` so every branch is unit-testable without Docker or npm. `run` wraps `spawnSync` inheriting stdio for long commands; on Windows it passes one command string with `shell: true` (needed for `npm.cmd`; an args array with `shell: true` triggers Node's DEP0190 warning). `probePort` uses `node:net` with a short timeout.
- `scripts/lib/setup.test.mjs` — Vitest `tooling` project (already includes `scripts/**`), 100% coverage.
- No change to `packages/*`; the app, `core` and `db` are untouched.

## 📝 Edge Cases & Failure Scenarios

| Scenario | What the user sees |
|---|---|
| Docker not installed / daemon not running | `✗ PostgreSQL — Docker is not available`, plus: start Docker, or use a native PostgreSQL and set `DATABASE_URL` in `.env`; exit 1 |
| Port 5432 taken by another PostgreSQL | `docker compose up` error is shown as-is, with the same native-PostgreSQL hint |
| `.env` has no `DATABASE_URL` | treated as the default (Docker path), never as "native" |
| Native PostgreSQL on 5432 with the default credentials | TCP probe finds it, Docker is skipped with a note, migrations run against it |
| Only legacy `docker-compose` v1 installed | treated as Docker unavailable, with the native-PostgreSQL hint (Compose v2 is what the README uses) |
| `.env` exists but lacks keys from `.env.example` | warning listing the missing keys; setup continues (env validation in `core` will name invalid values at runtime) |
| Native DB unreachable | step 5 fails with MikroORM's error and the hint to check `DATABASE_URL` |
| `npm install` fails (network) | its output, `✗ Dependencies`, exit 1; re-run resumes at the same step |
| Interrupted run (Ctrl+C) | re-run skips completed steps and continues |
| Node < 22 | stops before touching anything |

## 📝 Risks & Impact Review

- **Contracts:** adds root script `setup` — additive, not breaking per `BACKWARD_COMPATIBILITY.md` ("Root scripts"). Document it in README and the root-scripts line of `AGENTS.md`.
- **Never destructive:** setup never overwrites `.env`, never runs `docker compose down`, never drops data or resets the DB. Rollback = delete the script.
- **Windows:** supported on a best-effort basis via `shell: true` for `npm`/`docker`; verified only on Linux/WSL in this change.

## 📋 Phasing

One phase — the feature is small and ships as a single PR.

## 📋 Implementation Plan

### Phase 1 — `npm run setup`

1. **Step 1.1 — Step runner and Node check.** `scripts/lib/setup.mjs` with `main(deps)`, the step loop, output format, exit codes, and the Node-version step; `scripts/setup.mjs` entry with `scripts/setup.test.mjs`; `"setup"` in root `package.json`. Tests: pass/fail Node version, failure stops later steps, exit codes, entry sets `process.exitCode`.
2. **Step 1.2 — Dependencies and `.env` steps.** Lockfile-hash stamp check and write; `.env` copy; missing-key warning (parse `KEY=` lines, ignore comments). Tests: each check true/false, copy never overwrites, warning lists exact keys.
3. **Step 1.3 — PostgreSQL and migrations steps.** Effective `DATABASE_URL` resolution and native-DB detection (Q1, incl. missing key and TCP probe), `docker compose version` probe, healthy-container check, `up -d --wait`; `npm run db:migrate`; next-steps output. Tests: native skip, docker missing, already healthy skip, start path, compose failure, migration failure.
4. **Step 1.4 — Docs.** README "Getting started": `npm run setup` as the primary path, manual commands kept under "Manual setup"; `AGENTS.md` root-scripts line; note in `SDLC.md` not needed (validation gate unchanged).
5. **Step 1.5 — Verification.** `npm run validate` green (100% coverage). Manual: fresh clone + Docker → `npm run setup` → `npm run dev` → `/api/health` 200 `{"ok":true,"data":{"database":"up"}}`; second `npm run setup` reports every step skipped/up to date and exits 0; Docker stopped → clear failure, exit 1. Record results in this spec.

## Acceptance criteria

- Fresh clone with Docker running: `npm run setup` then `npm run dev` → `/api/health` returns 200 `{"ok":true,"data":{"database":"up"}}`.
- Second `npm run setup` on a set-up machine: every step reported as skipped or up to date, nothing changed, exit 0; `.env` never overwritten.
- Docker missing or stopped (default `DATABASE_URL`): clear message naming the native-PostgreSQL alternative, exit ≠ 0.
- README shows `npm run setup` first and keeps the manual steps.
- `npm run validate` green with 100% coverage, no new coverage exclusions.

## Out of scope

Containerizing the app, production or CI setup, seed data, installing Node or Docker, starting `npm run dev`, resetting the database.
