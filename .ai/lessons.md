# Lessons

Long-term memory for AI agents working in this repo. Read this file at the start of every task.

Rules:
- One line per lesson: `- YYYY-MM-DD — <rule or finding> ([details](lessons/YYYY-MM-DD-slug.md))`.
- Short, durable facts go directly here; anything needing context (root cause, repro, reasoning) goes into `lessons/` and is linked from here.
- Update or remove a lesson when it becomes wrong — do not add a contradicting duplicate.

## Index

<!-- Newest first. -->
- 2026-10-20 — Monorepo tooling: Next writes AGENTS.md into `packages/app/`, shadcn needs manual setup in `packages/ui`, Tailwind needs `@source` for workspace packages, CLI config must not import `server-only` ([details](lessons/2026-10-20-monorepo-tooling-gotchas.md))
- 2026-10-20 — A non-trivial change (e.g. restructuring the repo) needs a spec in `.ai/specs/` before proposing or starting implementation, not after the user asks for it.
