# packages/core — services, DI, HTTP layer

Business rules (services), the Awilix container, the server API layer, env, logger, events and shared validators. Imports only `@devmentor/db` — through the types it re-exports (`EntityManager`, `MikroORM`), never `@mikro-orm/*`; never `next`/`react`. Paths below are relative to the repo root.

## Entries

- `@devmentor/core` and `@devmentor/core/http` are server-only.
- `@devmentor/core/validators` (`packages/core/src/validators/`) holds the client-safe shared Zod schemas (`<concept>/<name>-<action>.schema.ts`); client components in `app` may import it. It imports only `zod`, its own files and the client-safe `packages/core/src/domain/` (ESLint + `packages/core/src/validators/index.test.ts`). `ui` never imports it: `CrudForm` takes the schema as a prop.

## HTTP layer (`packages/core/src/http/`)

- `errors.ts` — `AppError` + `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError` (429; its `headers` — `Retry-After` — and `retryAfterSeconds` reach the response), `ServiceUnavailableError`. Services throw these; they never build responses. Recognise them with `isAppError`/`isValidationError`, never `instanceof` — server bundles have separate copies of the classes while the container is shared.
- `apiHandler.ts` — wraps every route handler: CSRF header check on POST/PUT/PATCH/DELETE (`csrf: false` only for third-party webhooks), request scope (`cradle`), JSON envelope `{ ok: true, data }` / `{ ok: false, error: { code, message, fieldErrors? } }`, maps `AppError`/`ZodError`, logs unexpected errors without leaking them. `headers` option: extra headers on every response (e.g. `Cache-Control: no-store`).
- `makeCrudRoute.ts` — plain CRUD resource: `export const { GET, POST, PUT, DELETE } = makeCrudRoute({ service, createSchema, updateSchema })`; record id as `?id=<uuid>`. It has no auth hook yet, so it is for public resources only (no route uses it yet). Workflow endpoints (booking, payment, reschedule) use `apiHandler` directly.
- `parse.ts` — `parseJsonBody`, `parseSearchParams`, `parseWith`: always pass the schema's parsed output to services, never the raw body (no mass assignment).
- `auth.ts` — `requireSession(req, cradle)` (401 unless the live session check in `packages/core/src/auth/session-user.ts` passes: token, `session_version`, stored roles, `OPERATOR_EMAILS`) and `requireRole(user, ...roles)` (403, fail closed). Ownership assertions arrive with the first owned resource.
- `envelope.ts` — the API envelope types and the CSRF header; mirrored in `packages/ui/src/backend/api/types.ts` (`ui` cannot import `core`). Keep both in sync; a shared package for them is an Ask First change.

## Services and DI (Awilix)

- One container per process: `packages/core/src/container/container.ts`; its shape: `packages/core/src/container/cradle.ts`. Every dependency is registered by hand (no `loadModules`) — a new service is one line in each file. Services live in `packages/core/src/services/<concept>/<name>.service.ts`.
- Services get dependencies through the constructor (PROXY mode: one destructured object) and never import singletons or call `container.resolve`.
- Lifetimes: process-wide values (`env`, `logger`, `orm`, `clock`, `events`, `mailSender`, `passwordHasher`, `fetchJson`) are singletons; `em` (`orm.em.fork()`) and services using it are `scoped`. Routes get `cradle` from `apiHandler`; pages/server actions use `withScope((cradle) => ...)`.
- Check-then-write on shared state (slots, booking status) runs in one transaction in the service, backed by a unique constraint in `db`. No raw SQL with interpolated input.
- Env is validated by `packages/core/src/config/env.ts` (zod) — add new variables there.

## Events

Typed in-process emitter `packages/core/src/events/events.ts` (container singleton `events`; no queue/worker in this project). Event IDs follow `concept.entity.action` (e.g. `bookings.booking.created`); adding an event is one entry in `DomainEvents`.

## Reference implementations

- Service + container registration: `packages/core/src/services/mentors/mentor-profile.service.ts`, registered in `packages/core/src/container/container.ts` and `packages/core/src/container/cradle.ts`.
- Route handler with session and cookies (the app's route file only wires it): `packages/core/src/http/invitations.ts` (`acceptInvitation`).
- Shared schema: `packages/core/src/validators/auth/account-sign-in.schema.ts`.
