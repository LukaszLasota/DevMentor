# packages/db — MikroORM config, entities, migrations

Leaf package: imports nothing internal, never `next`/`react`. The only package that imports `@mikro-orm/*`; it re-exports the types others use (`EntityManager`, `MikroORM`). Paths below are relative to the repo root.

## Entities and migrations

- Entities with `defineEntity` + `setClass` (MikroORM 7, no decorators), UUID primary keys, snake_case plural tables. File: `packages/db/src/entities/<concept>/<name>.entity.ts`, registered in `packages/db/src/entities/index.ts`.
- Schema changes only via committed migrations: create with `npm run db -- migration:create`, apply with `npm run db:migrate` (owner-run: it reads `.env`). Never edit an applied migration; never use `schema:update` outside local experiments.
- A check-then-write in a service is backed by a unique constraint declared here.

## Connection and config

- Local database: `docker compose up -d postgres` (needs the owner's approval; credentials match `.env.example`).
- `db` receives options explicitly (`getOrm(options)`); only its CLI config (`packages/db/src/mikro-orm.config.ts`) reads `process.env` itself.
- One `MikroORM` instance per process (cached on `globalThis`, `packages/db/src/orm.ts`); never use the global `EntityManager`.

## Reference implementations

- Entity + migration: `packages/db/src/entities/mentors/mentor-profile.entity.ts` and `packages/db/src/migrations/Migration20261114193444.ts`.
- Partial unique index backing a check-then-write: `packages/db/src/entities/invitations/invitation.entity.ts`.
