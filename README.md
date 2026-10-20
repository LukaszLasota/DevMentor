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
| Tests | Vitest, jsdom, Testing Library |
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

Requirements: Node.js 22+, PostgreSQL 15+.

```bash
npm install
cp .env.example .env        # set DATABASE_URL to your PostgreSQL database
npm run db -- migration:up  # apply migrations
npm run dev
```

- Public site: [http://localhost:3000](http://localhost:3000)
- Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)
- Health check (DB connection via DI): [http://localhost:3000/api/health](http://localhost:3000/api/health) — `200 { ok: true }` or `503` when the database is down

## Scripts

| Command | Description |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app (`@devmentor/app`) |
| `npm run lint` | ESLint, incl. package boundary rules |
| `npm run typecheck` | TypeScript check in every package |
| `npm test` | Vitest (core: node, ui: jsdom) |
| `npm run audit` | `npm audit` gate (high/critical, minus `audit-allowlist.json`) |
| `npm run validate` | All of the above + build |
| `npm run db -- migration:create` | Generate a migration from entity changes |
| `npm run db -- migration:up` / `migration:down` | Apply / roll back migrations |
| `npm run db -- <command>` | Any other MikroORM CLI command |

## For AI agents

Rules for coding agents are in [AGENTS.md](AGENTS.md) (loaded by Claude Code via [CLAUDE.md](CLAUDE.md)). Specs, run logs and lessons learned live in [.ai/](.ai/).
