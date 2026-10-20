# CI and coverage gotchas (2026-10-20)

Found while implementing `specs/2026-10-20-ci-and-test-coverage.md`.

- **`vitest run --coverage --project <name>` reports 0/0** with a root-level `coverage.include`; run coverage for all projects and filter the report instead.
- **Unreachable branches block 100% branch coverage.** `z.flattenError` never returns empty field arrays, so a defensive `if (messages.length > 0)` is dead code — remove it rather than excluding it.
- **CLI scripts with top-level side effects are untestable** — keep the entry a one-liner (`process.exitCode = main()`) and put logic with injectable dependencies in `scripts/lib/`.
- **Testing modules with top-level env reads** (`mikro-orm.config.ts`, `next.config.ts`): `vi.resetModules()` + dynamic `import()` per case, `vi.stubEnv`, `vi.spyOn(process, 'cwd' | 'loadEnvFile')`.
- **Root layouts render `<html>`** — test them with `renderToStaticMarkup`, not Testing Library's `render`. Mock `next/font/google`.
- **agent-browser** finds an existing Chrome/Playwright install locally; `--json` gives `{ success, data, error }` and failed commands still print JSON. Use a unique `AGENT_BROWSER_SESSION` per run and close it in `afterAll`. CI: `npx agent-browser install --with-deps`.
- **Integration setup with testcontainers:** `next start` needs `.next/BUILD_ID` (build first); pass `DATABASE_URL` explicitly — it wins over the root `.env` because `@next/env` and `process.loadEnvFile` never override existing variables.
- **`git mv` after editing a file, then `git commit -am`, committed only the rename** — the edits stayed unstaged (spec status landed as `in-progress` in #6). Move first, then edit, or `git add` the new path explicitly and check `git status` before pushing.
