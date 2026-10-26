# Lessons

Long-term memory for AI agents working in this repo. Read this file at the start of every task.

Rules:
- One line per lesson: `- YYYY-MM-DD — <rule or finding> ([details](lessons/YYYY-MM-DD-slug.md))`.
- Short, durable facts go directly here; anything needing context (root cause, repro, reasoning) goes into `lessons/` and is linked from here.
- Update or remove a lesson when it becomes wrong — do not add a contradicting duplicate.

## Index

<!-- Newest first. -->
- 2026-10-26 — `CrudForm` (packages/ui): after a field error, the first click on the submit button is lost — the error under the field disappears on blur, the button moves up before mouseup. Found by an agent-browser walk of the lesson-07 prototype (s01: short password → Sign in → valid password → one click does nothing). Fixed: a field that shows an error is re-validated on change, so the error clears while typing, not on blur (regression test in `CrudForm.test.tsx`).
- 2026-10-26 — An unanchored `.gitignore` entry such as `prototypes/` also hides `.ai/prototypes/` (skill output); anchor root-only folders as `/prototypes/` and check `git status` for vanished untracked paths after editing ignores.
- 2026-10-26 — agent-browser refuses to click a Radix `Select` option that sits over its trigger ("covered by <span>"), and the page stays `aria-hidden` for a moment after the menu closes; use `position="popper"` and wait ~500 ms after choosing. Native date/time inputs ignore `fill`: focus them and press the digits (`11052026`, `0630P`).
- 2026-10-22 — Before a browser check of Storybook, restart `storybook dev` after config changes (staticDirs, addons): a stale server rendered every story as an error page and a width check "passed" on error pages. Assert the story actually rendered (no error text, expected landmark) in such scripts.
- 2026-10-22 — `npx shadcn add` for a component that depends on a restyled primitive (e.g. alert-dialog → button) prompts to overwrite it and hangs in a non-interactive shell; pipe `n` answers and fix the generated `@/components/ui/*` imports to relative ones (the app maps `@` to its own src).
- 2026-10-22 — After changing `packages/ui/src/styles.css`/`tokens.css`, `next dev` and even `next build` served the old CSS from the `packages/app/.next` cache; `rm -rf packages/app/.next` fixed it. Check the served CSS (grep for a new token) before auditing UI changes.
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
