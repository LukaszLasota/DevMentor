# Final gate — stripe-webhook-inbox

**When:** 2026-11-20T13:02:03Z

## validation.commands
- `npm run validate` ✅ (check:agents, lint 0 errors, typecheck, test:coverage 165 files / 1687 tests / 100%, build without a database, audit: no blocking advisories)
- `npm run test:integration` ⏳ cannot run in the agent sandbox (no Docker); runs in CI on the PR (`stripe-webhook.test.ts`: stub → app → PostgreSQL, redelivery, bad signatures, constraints; the existing mentor_profiles down/up test also reverts and reapplies Migration20261120160000).

## Design-system pass
- Skipped: no UI in this phase.
