# Run: `om-auto-fix-issue 12` — one-command local setup

- **Goal:** issue #12 — `npm run setup`, an idempotent installer for README "Getting started", plus README update.
- **Spec:** `.ai/specs/2026-10-21-npm-run-setup.md`
- **Route:** feature route — `om-auto-write-spec 12` (spec PR) → `om-auto-implement-spec` (implementation PR).

## Steps

1. FR triage: issue open and unclaimed; no `setup` script in `package.json`; no covering spec (`.ai/specs/implemented/2026-10-20-local-setup.md` defines the manual steps only); `SDLC.md` has no Definition of Ready → ready.
2. Claimed #12; worktree `.ai/tmp/om-auto-write-spec/…` on `spec/npm-run-setup`.
3. Spec written with `om-spec-writing --autonomous`; three Open Questions resolved with reversible defaults (native PostgreSQL detection via `DATABASE_URL`, no `npm run dev` at the end, warn-only `.env` drift). None needs human confirmation.
4. Fresh-context scope review of the spec: one capability (no split). Fixed before commit: entry `scripts/setup.mjs` needs its own test (coverage includes `scripts/**`); native-DB detection now uses the effective `DATABASE_URL` (env → `.env` → default; missing key = default) plus a TCP probe of the default port; dependency freshness uses a lockfile-hash stamp instead of mtimes; healthy check via `docker compose ps --format json`; Windows `shell: true` with a command string (DEP0190).

## Decisions

- No UI mockups: the feature is a CLI script, no user-facing screens.

5. Implementation via `om-auto-implement-spec` → `om-auto-create-pr`: PR #14, plan `.ai/runs/2026-10-21-npm-run-setup-impl.md` (steps, verification, review passes).
6. Review: fresh-context `om-auto-review-pr` (request changes → fixed → approve), then a full `om-code-review` (approve, two minors fixed in 53caa84).

## Open issues

- Not exercised for real: the `docker compose up -d --wait` start path and Windows.

## Outcome

- Done: #13 (spec) and #14 (implementation) merged 2026-10-21, issue #12 closed; spec moved to `.ai/specs/implemented/`.
