# Engineering standards rollout gotchas (2026-10-20)

Found while implementing `specs/2026-09-01-engineering-standards.md`.

- **The spec was written for another bootstrap.** Before implementing an imported spec, diff its "current state" assumptions against the repo; here several files it migrates never existed. Record deviations in the spec ("Adaptation notes") instead of silently diverging.
- **`export const dynamic` is gone with `cacheComponents` (Next 16).** Uncached data (DB) runs at request time automatically; verify with `npm run build` without a DB (route shows as `ƒ`).
- **`server-only` throws under Vitest.** Alias it to an empty stub in `vitest.config.mts`.
- **Radix primitives need `ResizeObserver`, which jsdom lacks** — stubbed in `packages/ui/vitest.setup.ts`.
- **`react-hooks/set-state-in-effect`** flags `setState` reached synchronously from an effect. Fetch in the effect, set state in `.then`, re-run via an `attempt` counter (see `HealthPanel.tsx`).
- **Next injects an empty `role="alert"` (route announcer)** — scope browser assertions to `main`.
- **`braces` (GHSA-vfj7-8cjw-p6xm) has no patched release**; `npm audit fix --force` would downgrade awilix/eslint-config-next/shadcn by majors. Accepted via `audit-allowlist.json` with a review date.
- **Playwright browsers are cached in `~/.cache/ms-playwright`, but a newer `playwright` wants a newer build** — pass `executablePath` to the cached `chromium_headless_shell-*` instead of downloading.
