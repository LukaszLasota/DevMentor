# DevMentor

Web application built with Next.js, TypeScript and React, backed by PostgreSQL.

## Tech stack

| Area | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL |
| ORM | MikroORM 7 — entities, migrations, connection pooling |
| Dependency injection | Awilix |
| Styling | Tailwind CSS 4 (public pages), shadcn/ui (admin pages) |
| Repo layout | Monorepo, npm workspaces |

## Architecture

```
packages/
├── app/    # Next.js application — routes, pages, server actions, DI composition root
├── core/   # Reusable, framework-agnostic code — domain types, services, interfaces
├── db/     # MikroORM config, entities, repositories, migrations, seeders
└── ui/     # Reusable React components, incl. shadcn/ui
```

Dependency direction (no cycles):

```
app ──► core
app ──► db ──► core
app ──► ui ──► core (types only)
```

- **core** has no dependency on React, Next.js or MikroORM, so business logic stays testable and portable.
- **db** owns everything data-related. Schema changes go through committed MikroORM migrations. Connection and pool settings come from `DATABASE_URL` and the MikroORM config.
- **ui** holds shared components. shadcn/ui components are generated here with the shadcn CLI.
- **app** wires everything together: it builds the Awilix container (composition root), creates a scope per request with a forked MikroORM `EntityManager`, and resolves services from it in route handlers, server components and server actions.

Frontend vs. admin:

- `app/(site)` — public pages, styled with Tailwind.
- `app/(admin)` — admin panel, built with shadcn/ui.

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
- Health check (DB connection via DI): [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app (`@devmentor/app`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check in every package |
| `npm run db -- migration:create` | Generate a migration from entity changes |
| `npm run db -- migration:up` / `migration:down` | Apply / roll back migrations |
| `npm run db -- <command>` | Any other MikroORM CLI command |

## For AI agents

Rules for coding agents are in [AGENTS.md](AGENTS.md) (loaded by Claude Code via [CLAUDE.md](CLAUDE.md)). Specs, run logs and lessons learned live in [.ai/](.ai/).
