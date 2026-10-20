# Lessons

Long-term memory for AI agents working in this repo. Read this file at the start of every task.

Rules:
- One line per lesson: `- YYYY-MM-DD — <rule or finding> ([details](lessons/YYYY-MM-DD-slug.md))`.
- Short, durable facts go directly here; anything needing context (root cause, repro, reasoning) goes into `lessons/` and is linked from here.
- Update or remove a lesson when it becomes wrong — do not add a contradicting duplicate.

## Index

<!-- Newest first. -->
- 2026-10-20 — 100% coverage: remove unreachable branches instead of excluding them; keep script entries one-line and logic in `scripts/lib/`; integration tests need a build and an explicit `DATABASE_URL` ([details](lessons/2026-10-20-ci-and-coverage-gotchas.md))
- 2026-10-20 — Verify setup docs by running them verbatim on a fresh clone with a real `.env`; passing env vars inline hid a broken root-`.env` loader in `next.config.ts` ([details](lessons/2026-10-20-engineering-standards-gotchas.md))
- 2026-10-20 — Engineering standards: imported specs may assume files that do not exist — record "Adaptation notes"; no `export const dynamic` with `cacheComponents`; Vitest needs `server-only` alias and a `ResizeObserver` stub for Radix ([details](lessons/2026-10-20-engineering-standards-gotchas.md))
- 2026-10-20 — Monorepo tooling: Next writes AGENTS.md into `packages/app/`, shadcn needs manual setup in `packages/ui`, Tailwind needs `@source` for workspace packages, CLI config must not import `server-only` ([details](lessons/2026-10-20-monorepo-tooling-gotchas.md))
- 2026-10-20 — A non-trivial change (e.g. restructuring the repo) needs a spec in `.ai/specs/` before proposing or starting implementation, not after the user asks for it.
