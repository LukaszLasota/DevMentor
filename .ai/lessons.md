# Lessons

Long-term memory for AI agents working in this repo. Read this file at the start of every task.

Rules:
- One line per lesson: `- YYYY-MM-DD — <rule or finding> ([details](lessons/YYYY-MM-DD-slug.md))`.
- Short, durable facts go directly here; anything needing context (root cause, repro, reasoning) goes into `lessons/` and is linked from here.
- Update or remove a lesson when it becomes wrong — do not add a contradicting duplicate.

## Index

<!-- Newest first. -->
- 2026-10-22 — CSS custom properties that alias other tokens (`--primary: var(--dm-action-primary-fill)`) resolve where they are declared; declare aliases on `:root, .light, .dark` or a nested theme scope inherits the root theme's value (`packages/ui/src/tokens.css`).
- 2026-10-22 — Storybook docs (MDX) pages run no story decorators: theme switching for docs needs a channel listener (`SET_GLOBALS`/`GLOBALS_UPDATED`) plus a custom `docs.container` (`packages/ui/.storybook/preview.tsx`).
- 2026-10-21 — Course reference specs can differ from what the trainer says in the video (mentor+operator: "separate" in the video, combinable in the final spec); check the spec file before adopting a course decision
- 2026-10-21 — `om-backlog` filing: a story can depend on one filed later (E01-S06 → E03-S01), so write `Depends on:` lines after every issue exists, not while creating them
- 2026-10-21 — `npm run dev -- -p <port>` does not reach `next dev` through the nested workspace script (it becomes a project dir); use `PORT=<port> npm run dev`
- 2026-10-21 — With the om spec/implementation split a spec reaches `main` via its own spec PR; move it to `implemented/` only after that PR merges
- 2026-10-21 — om-* skills call bare `gh`, but this repo is on a personal account while the active `gh` account may be work; `.ai/trackers/github.md` scopes `GH_TOKEN` to the `origin` owner — keep that override when refreshing the descriptor. They also need `gh` >= 2.82.1
- 2026-10-21 — `npx skills add ... -a claude-code` alone copies skills into `.claude/skills/`; add a universal agent (`-a claude-code -a codex`) so the canonical copy lives in `.agents/skills/` and `.claude/skills/` holds only symlinks. Remove an existing copied `.claude/skills/` first — the CLI does not replace it
- 2026-10-20 — 100% coverage: remove unreachable branches instead of excluding them; keep script entries one-line and logic in `scripts/lib/`; integration tests need a build and an explicit `DATABASE_URL` ([details](lessons/2026-10-20-ci-and-coverage-gotchas.md))
- 2026-10-20 — Verify setup docs by running them verbatim on a fresh clone with a real `.env`; passing env vars inline hid a broken root-`.env` loader in `next.config.ts` ([details](lessons/2026-10-20-engineering-standards-gotchas.md))
- 2026-10-20 — Engineering standards: imported specs may assume files that do not exist — record "Adaptation notes"; no `export const dynamic` with `cacheComponents`; Vitest needs `server-only` alias and a `ResizeObserver` stub for Radix ([details](lessons/2026-10-20-engineering-standards-gotchas.md))
- 2026-10-20 — Monorepo tooling: Next writes AGENTS.md into `packages/app/`, shadcn needs manual setup in `packages/ui`, Tailwind needs `@source` for workspace packages, CLI config must not import `server-only` ([details](lessons/2026-10-20-monorepo-tooling-gotchas.md))
- 2026-10-20 — A non-trivial change (e.g. restructuring the repo) needs a spec in `.ai/specs/` before proposing or starting implementation, not after the user asks for it.
