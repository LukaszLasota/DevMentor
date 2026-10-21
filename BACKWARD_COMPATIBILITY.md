# Backward compatibility

Protected contract surfaces of DevMentor and the path a change to one must take. Review skills (`om-code-review`, `om-auto-review-pr`) check diffs against this file; implementation skills warn when a change breaks it.

DevMentor is pre-release with no external API consumers, so most surfaces protect **internal consumers in this monorepo** (`app → core → db`, `ui`). A breaking change is allowed when every consumer is updated in the same PR and the PR body says so; the exceptions are the database (applied migrations) and anything a browser already holds (the API envelope and CSRF header across a deploy).

## Surfaces

| Surface | Where | Breaking change | Required path |
|---|---|---|---|
| API envelope | `packages/core/src/http/envelope.ts`, mirrored in `packages/ui/src/backend/api/types.ts` | Renaming/removing `ok`, `data`, `error.code`, `error.message`, `error.fieldErrors`; changing their types | Change both copies in the same PR; update `apiCall` and its tests. |
| Error codes and HTTP status | `packages/core/src/http/errors.ts` (`VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `SERVICE_UNAVAILABLE` 503) | Renaming a code, changing a code's status, reusing a code for a different meaning | Add a new code instead of repurposing one; update every UI branch on the old code in the same PR. |
| CSRF header | `CSRF_HEADER` / `CSRF_HEADER_VALUE` in both envelope files | Changing name or value; dropping the check on a mutating method | Change server and client in the same PR; `csrf: false` only for third-party webhooks. |
| HTTP routes | `packages/app/src/app/api/**/route.ts` (today: `GET /api/health`) | Removing/renaming a route, changing method, required params or response `data` shape; CRUD id leaving `?id=<uuid>` | Update every caller in the same PR; once a route has an external consumer (webhook, mobile client), deprecate before removing. |
| Package public entries | `@devmentor/core`, `@devmentor/core/http`, `@devmentor/db`, `@devmentor/ui`, `@devmentor/ui/styles.css` (`exports` in each `package.json`) | Removing or renaming an exported symbol or entry; changing an exported function's signature | Update all importers in the same PR; `npm run typecheck` must stay green. Deep imports into another package are never a supported surface. |
| Dependency direction | `no-restricted-imports` in `eslint.config.mjs` | Loosening a restriction | Ask First (see `AGENTS.md`). |
| Database schema | `packages/db/src/migrations/`, entities in `packages/db/src/entities/` | Editing an applied migration; dropping/renaming a column or table in one step; tightening a constraint over existing data | New migration only. Destructive changes go expand → migrate data → contract across separate migrations; the PR carries `risk-high` and a rollback note. |
| Environment variables | `packages/core/src/config/env.ts`, `.env.example` | Renaming/removing a variable; making an optional one required; changing a default | Update `env.ts`, `.env.example` and CI (`.github/workflows/ci.yml`) together; call it out in the PR body. |
| Root scripts | `package.json` scripts (`dev`, `build`, `validate`, `test:*`, `db:*`, `audit`) and `.ai/agentic.config.json` `validation.commands` | Renaming/removing a script that CI, docs or the agent pipeline call | Update CI, `AGENTS.md`, `SDLC.md` and the config in the same PR. |

## Not protected

Page markup and styling, internal service methods not exported from a package entry, test helpers, and anything under `.ai/` other than `agentic.config.json` and the tracker/browser descriptors.
