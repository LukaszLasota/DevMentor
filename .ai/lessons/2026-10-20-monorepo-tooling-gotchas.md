# Monorepo tooling gotchas (2026-10-20)

Found while converting the repo to npm workspaces (spec: `specs/implemented/2026-10-20-monorepo-setup.md`).

- **`next dev` writes `AGENTS.md` into the Next.js app directory** (`packages/app/`), not the repo root. Keep project rules in the root `AGENTS.md`; the root `CLAUDE.md` imports both files.
- **`shadcn init` fails in `packages/ui`** ("could not detect a supported framework") and `shadcn add` alone skips the theme CSS. Set up the package manually per https://ui.shadcn.com/docs/installation/manual (deps, `src/styles.css` theme, `components.json`), then `shadcn add` works. The CLI's prompts can be answered by piping `printf 'y\n'`.
- **Tailwind v4 does not scan workspace packages** (they sit behind `node_modules` symlinks); `packages/ui/src/styles.css` has `@source "./"`.
- **`server-only` throws outside Next.js**, so the MikroORM CLI config must import `./config`, never the package entry `@devmentor/db`.
- **Env files are read from the app directory by Next.js** — `next.config.ts` calls `loadEnvConfig` on the repo root so app and CLI share one `.env`.
- **`pkill -f "next dev"` inside a Bash tool call kills that shell itself** (its command line matches). Run the dev server as a background task and stop it with TaskStop.
