# DevMentor

Web application built with Next.js, TypeScript and React, backed by PostgreSQL.

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| Database | PostgreSQL |
| ORM | MikroORM 7 — entities, migrations, connection pooling |
| Dependency injection | Awilix |
| Validation / config | Zod 4 (shared schemas, env validation) |
| Logging | pino (secrets redacted) |
| Styling | Tailwind CSS 4 (public pages), shadcn/ui (admin pages) |
| Tests | Vitest + v8 coverage (100% required), Testing Library, testcontainers, agent-browser |
| CI | GitHub Actions on every pull request |
| Repo layout | Monorepo, npm workspaces |

## Architecture

```
packages/
├── app/    # Next.js app (src/app) — pages and route handlers: HTTP and rendering only
├── core/   # Business logic — services, DI container, http/ API layer, env, logger
├── db/     # MikroORM config, entities, migrations
└── ui/     # React components — shadcn/ui primitives, backend/ panel layer
```

Dependency direction (enforced by ESLint):

```
app ──► core ──► db
app ──► ui            (ui is standalone)
```

- **db** is a leaf: the only package that touches MikroORM. It exports `getOrm(options)` and the ORM types.
- **core** holds the business rules (services), the Awilix container with one scope per request, env validation and the logger. `core/http` is the server API layer: typed errors, `apiHandler` (CSRF check, JSON envelope, error mapping) and `makeCrudRoute` for plain CRUD resources.
- **ui** has the shadcn/ui primitives and the panel layer in `backend/`: `apiCall` (the only way to call `/api/*` from the browser), `CrudForm`, `DataTable`, and the loading/error/empty states.
- **app** stays thin: a route is `apiHandler(({ cradle }) => cradle.someService.method())`, and a page composes `ui` components.

Every API response uses one envelope: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "fieldErrors"? } }`.

Domain code is organized by concept (`bookings`, `mentors`, ...) in same-named folders across the layers, created when the first file of a concept is added. Details: [engineering standards](.ai/specs/2026-09-01-engineering-standards.md).

Route groups in `packages/app/src/app`:

- `(marketing)` — public pages, styled with Tailwind.
- `(admin)` — admin panel, built with shadcn/ui.

## Getting started

Requirements: Node.js 22+, Docker (or a native PostgreSQL 15+).

```bash
git clone git@github.com:LukaszLasota/DevMentor.git && cd DevMentor
npm run setup                   # installs deps, creates .env, starts PostgreSQL, applies migrations
npm run dev                     # http://localhost:3000
```

`npm run setup` is safe to re-run (e.g. after a pull): steps already done are skipped, and an existing `.env` is never overwritten. With a native PostgreSQL, set `DATABASE_URL` in `.env` first — setup then skips Docker; it also skips Docker when something already listens on the default `localhost:5432`.

### Manual setup

The same steps by hand:

```bash
npm install
docker compose up -d postgres   # or a native PostgreSQL — then adjust DATABASE_URL
cp .env.example .env            # defaults match docker-compose.yml; set SESSION_SECRET=$(openssl rand -hex 32)
npm run db:migrate              # applies the migrations committed in packages/db/src/migrations
npm run dev                     # http://localhost:3000
```

- Public site: [http://localhost:3000](http://localhost:3000)
- Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)
- Health check (DB connection via DI): [http://localhost:3000/api/health](http://localhost:3000/api/health) — `200 { ok: true }` or `503` when the database is down

### Sign in locally (GitHub stub)

Until a GitHub OAuth App is set up, sign in through a local GitHub stub (`scripts/lib/github-stub.mjs`, the same one the integration tests use). It skips GitHub's consent screen and turns the `login` hint into a persona `<login>@devmentor.test` with a verified email.

1. Database: `docker compose up -d postgres`, then `npm run db:migrate`.
2. `.env` (local only, never committed) — in addition to the defaults:

   ```bash
   SESSION_SECRET=<openssl rand -hex 32>
   APP_URL=http://localhost:3000
   ALLOW_TEST_OVERRIDES=1                  # the app refuses the override URLs below without it
   GITHUB_OAUTH_URL=http://localhost:3999
   GITHUB_API_URL=http://localhost:3999
   GITHUB_CLIENT_ID=local-stub-client      # any non-empty values
   GITHUB_CLIENT_SECRET=local-stub-secret
   OPERATOR_EMAILS=mock-operator@devmentor.test
   ```

3. Second terminal: `npm run github:stub` (port 3999; `GITHUB_STUB_PORT` changes it).
4. `npm run dev`, then open a persona:
   - [`/sign-in?login=mock-operator`](http://localhost:3000/sign-in?login=mock-operator) → "Continue with GitHub" → `/admin` (operator);
   - [`/sign-in?login=mock-mentee`](http://localhost:3000/sign-in?login=mock-mentee) → `/mentors` (mentee; any other login is a new mentee too);
   - `login=deny` → "You cancelled GitHub sign-in."; `login=mock-unverified` → no verified email.

   `/api/auth/github?login=<persona>` starts the same flow directly. Accounts are created on the first sign-in; there is no seed. If port 3000 is taken, run `PORT=3001 npm run dev` and set `APP_URL=http://localhost:3001`.

## Scripts

| Command | Description |
|---|---|
| `npm run setup` | Idempotent local setup: dependencies, `.env`, PostgreSQL (Docker), migrations |
| `npm run dev` / `build` / `start` | Next.js app (`@devmentor/app`) |
| `npm run lint` | ESLint, incl. package boundary rules |
| `npm run typecheck` | TypeScript check in every package |
| `npm test` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with the 100% coverage gate |
| `npm run test:integration` | Build + integration tests: PostgreSQL via testcontainers, GitHub stub, pages via agent-browser (needs Docker); `DEBUG_APP_LOGS=1` prints the app log |
| `npm run github:stub` | Local GitHub OAuth stub on port 3999 (see "Sign in locally") |
| `npm run audit` | `npm audit` gate (high/critical, minus `audit-allowlist.json`) |
| `npm run validate` | Lint, typecheck, coverage, build, audit |
| `npm run db:migrate` | Apply all pending migrations |
| `npm run db -- migration:create` | Generate a migration from entity changes |
| `npm run db -- migration:up` / `migration:down` | Apply / roll back migrations |
| `npm run db -- <command>` | Any other MikroORM CLI command |

## For AI agents

Rules for coding agents are in [AGENTS.md](AGENTS.md) (loaded by Claude Code via [CLAUDE.md](CLAUDE.md)). Specs, run logs and lessons learned live in [.ai/](.ai/).
