# Checkpoint 1 — Phase 1 (steps 1.1..1.4-fix)

**Time:** 2026-11-20T10:51:29Z
**Steps:** 1.1 (dee772d, executor: cheap tier/Sonnet), 1.2 (67023c6), 1.3 (792f603), 1.4 (ec9d1f3), 1.4-fix (289bd9c)
**Touched areas:** core money module + session lengths, env (PLATFORM_CURRENCY / PLATFORM_PRICE_BOUNDS), PlatformSettingsService, db price columns + migration, integration env, README, .env.example, engineering standards money bullet

| Check | Result | Notes |
|---|---|---|
| npm run lint | ✅ pass | 0 errors |
| npm run typecheck | ✅ pass | |
| npm run test:coverage | ✅ pass | 152 files, 1553 tests, 100% |
| npm run build | ✅ pass | no database, no price env (settings read at request time) |
| Integration suite | ⏭️ skipped | no Docker here; CI runs it on PR #51 |
| UI verification | ⏭️ skipped | no UI in this window |

Notes:
- 1.4 landed with a failing entity test (the underscore naming strategy maps `price25Cents` to `price25cents`); 1.4-fix sets explicit column names. The migration SQL was already correct.
- `.github/workflows/ci.yml` was not changed: the push token lacks the `workflow` scope. Not needed: `integration/global-setup.ts` passes the price env to the app under test.
