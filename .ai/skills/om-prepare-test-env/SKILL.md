# om-prepare-test-env — DevMentor notes

- Entrypoint: `sh .ai/scripts/test-env-up.sh` (owner-run: needs Docker, runs outside the agent sandbox — `! sh .ai/scripts/test-env-up.sh`). Teardown: `sh .ai/scripts/test-env-down.sh`.
- Wiring mirrors `packages/app/integration/global-setup.ts`: PostgreSQL 17 in the scoped container `devmentor-test-env-pg` on a random loopback port, `npm run db:migrate` + `npm run db:seed` with `DATABASE_URL` exported (the exported value wins over the repo's dotenv file), the GitHub and Stripe stubs and `next start` from `.ai/scripts/test-env-launcher.mjs`.
- The agent's own sandboxed commands cannot reach the running app (private network): the owner tests in the browser, or the agent's browser checks run as owner-approved commands.
- Sign in with GitHub through the stub: any login works (`<login>@devmentor.test`); `mock-mentor` is a ready mentor, `mock-operator` is the operator, `mock-mentee` a plain mentee.
- `npm run db:migrate` rewrites the MikroORM snapshot (key order only); the up script backs it up and restores it so the worktree stays clean.
