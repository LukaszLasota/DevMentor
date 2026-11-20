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
| Styling | Tailwind CSS 4 (public pages), shadcn/ui (signed-in panel pages: auth, mentee, mentor, admin) |
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
- `(auth)` — sign-in, register and verify email; panel surface built with shadcn/ui.
- `(mentee)`, `(mentor)` — persona areas for signed-in users (guarded pages), in the signed-in shell (`AppShell`), built with shadcn/ui.
- `(admin)` — admin panel for operators (role guard), same shell, built with shadcn/ui.
- `invitation/` — the public, session-aware mentor invitation link (`/invitation/[token]`), outside the route groups with its own root layout.

Each group has its own root layout; there is no `src/app/layout.tsx`.

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

Until a GitHub OAuth App is set up, sign in through a local GitHub stub (`scripts/lib/github-stub.mjs`, the same one the integration tests use). It skips GitHub's consent screen and turns the `login` hint into a persona `<login>@devmentor.test` with a verified email (`<base>--<suffix>` is another GitHub account sharing `<base>`'s email).

1. Database: `docker compose up -d postgres`, then `npm run db:migrate`.
2. `.env` (local only, never committed) — in addition to the defaults:

   ```bash
   SESSION_SECRET=<openssl rand -hex 32>
   APP_URL=http://localhost:3000
   ALLOW_TEST_OVERRIDES=1                  # the app refuses the override URLs below without it
   DEVMENTOR_GITHUB_OAUTH_URL=http://localhost:3999
   DEVMENTOR_GITHUB_API_URL=http://localhost:3999
   GITHUB_CLIENT_ID=local-stub-client      # any non-empty values
   GITHUB_CLIENT_SECRET=local-stub-secret
   OPERATOR_EMAILS=mock-operator@devmentor.test
   ```

3. Second terminal: `npm run github:stub` (port 3999; `GITHUB_STUB_PORT` changes it).
4. `npm run dev`, then open a persona:
   - [`/sign-in?login=mock-operator`](http://localhost:3000/sign-in?login=mock-operator) → "Continue with GitHub" → `/admin` (operator);
   - [`/sign-in?login=mock-mentee`](http://localhost:3000/sign-in?login=mock-mentee) → `/mentors` (mentee; any other login is a new mentee too);
   - `login=deny` → "You cancelled GitHub sign-in."; `login=mock-unverified` → no verified email.

   `/api/auth/github?login=<persona>` starts the same flow directly. Accounts are created on the first sign-in, or ahead of time with `npm run db:seed` ("Seed demo accounts"). If port 3000 is taken, run `PORT=3001 npm run dev` and set `APP_URL=http://localhost:3001`.

### Mentor prices (platform currency and bounds)

`PLATFORM_CURRENCY` and `PLATFORM_PRICE_BOUNDS` set the one platform currency and the allowed 25- and 50-minute prices in minor units (decision 2026-11-20: PLN; 25 min 50.00–300.00, 50 min 100.00–600.00). `.env.example` and the integration runner (`packages/app/integration/global-setup.ts`) carry these values; copy them into an existing `.env`. Set both or neither: a half-set or malformed pair refuses boot, and without them prices cannot be saved (503) and no mentor is bookable. The operator changes the bounds by hand (R16): a later save is checked against the new bounds; stored prices are not rewritten.

### Seed demo accounts

```bash
npm run db:seed        # development only; reads DATABASE_URL from .env
```

Creates (or restores) demo accounts in the local database and prints them. Re-running changes nothing; a demo account you changed (password, GitHub link) is put back and its sessions end. Other accounts are never touched. It refuses to run with `NODE_ENV=production`, because the password is published here, and it refuses a `DATABASE_URL` whose host is not local (`localhost`, `127.0.0.1`, `::1` — the compose database and the integration testcontainers): `NODE_ENV` defaults to development, so it alone would not stop a seed of a live database. For a disposable database elsewhere, opt in with `npm run db:seed -- --allow-remote-database`.

Password: `mock-password-not-a-secret`

| Account | Roles | Sign in with |
|---|---|---|
| `mock-mentee@devmentor.test` | mentee (invite it to try the invitation flow) | password, or GitHub stub `login=mock-mentee` |
| `mock-mentor@devmentor.test` | mentee + mentor, with a mentor profile | password, or GitHub stub `login=mock-mentor` |
| `mock-operator@devmentor.test` | mentee + mentor + operator (operator while listed in `OPERATOR_EMAILS`), with a mentor profile | password, or GitHub stub `login=mock-operator` |
| `mock-github-only@devmentor.test` | mentee | GitHub stub `login=mock-github-only` only; password sign-in is refused |
| `mock-pending@example.com` | mentee | nothing: a pending registration (unverified, no password, no GitHub) |

Mentor accounts get their mentor profile with the publish-by deadline an accepted invitation would set (now + `MENTOR_PUBLISH_WINDOW_DAYS`); re-seeding never moves a deadline. Re-seeding does reset roles to the table above, so a `mentor` role that `mock-mentee` gained by accepting an invitation is removed again (its profile and the accepted invitation stay). The GitHub identities match the stub's personas, so stub sign-in lands on the seeded account.

### Invite a mentor

Only invited engineers become mentors. The operator creates an invitation in the terminal and sends the printed link by hand (R16: no operator screen, no mail transport); the invited person opens it, signs in with the invited, verified email and accepts. Needs `APP_URL` (the links are built from it) and reads `DATABASE_URL` from `.env`.

```bash
npm run invite -- create --email <email> --tags <tag,...> [--batch <name>] --operator <your name>
npm run invite -- list [--batch <name>]   # status, expiry, accepted and publish-by dates
npm run invite -- resend <id>             # new link and expiry; the old link stops working
npm run invite -- revoke <id>             # the link stops working
npm run invite -- --help
```

Tags: `typescript`, `react`, `python`, `ai-agents` (display names such as `TypeScript` or `"AI agents"` work too, any case). Example:

```text
$ npm run invite -- create --email ada@example.com --tags react,typescript --batch b1 --operator lukasz
Invitation link for ada@example.com (shown once; send it by hand):
http://localhost:3000/invitation/Xq3v9b2LkT0mWn7pR4sYd8eFh1jC6uAz5gNo-_EiQ0c

Audit line for the shared note:
2026-11-14T20:23:24Z invited ada@example.com tags=typescript,react batch=b1 by lukasz id=3f6c1e2a-8b7d-4c59-9e0f-1a2b3c4d5e6f expires=2026-11-28T20:23:24Z
```

The link is printed once and only its hash is stored: if it is lost, `resend` makes a new one. Paste the token-free audit line into the shared operator note. An email can hold one unresolved invitation (pending or expired): resend or revoke it before creating another; a current mentor cannot be invited. Errors print the reason (per option for invalid input) and exit with code 1. Times are UTC.

### Sign in with real GitHub (OAuth App)

Each environment gets its own OAuth App (one for localhost, one for production), registered by founder B. Client ID and secret live only in `.env` and the deploy environment, never in the repository.

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:

   | Field | Local value |
   |---|---|
   | Application name | `DevMentor (local)` — name the environment |
   | Homepage URL | `http://localhost:3000` |
   | Authorization callback URL | `http://localhost:3000/api/auth/github/callback` |
   | Enable Device Flow | off |

   OAuth Apps have no permission screen: the app asks for the scopes `read:user user:email` on each sign-in (read-only profile and email addresses), and GitHub shows them on the consent screen.
2. Register the app, copy the Client ID, then "Generate a new client secret" and copy it (GitHub shows it once).
3. `.env`: remove (or comment out) the stub lines `ALLOW_TEST_OVERRIDES`, `DEVMENTOR_GITHUB_OAUTH_URL`, `DEVMENTOR_GITHUB_API_URL`, then set

   ```bash
   GITHUB_CLIENT_ID=<client id>
   GITHUB_CLIENT_SECRET=<client secret>
   APP_URL=http://localhost:3000          # must match the callback URL's origin
   OPERATOR_EMAILS=<your GitHub primary email>   # optional, to reach /admin
   ```

4. Restart `npm run dev`, open [`/sign-in`](http://localhost:3000/sign-in), "Continue with GitHub", approve → you land on your role home. Your account is created from your GitHub verified primary email.

Revoke a session on GitHub's side: Settings → Applications → Authorized OAuth Apps → Revoke; the next sign-in shows the consent screen again.

### Register with email locally

With `MAIL_PROVIDER=log` (the default outside production) no email is sent: the app writes it to its own log as a JSON line with `"msg":"mail.sent"` (`LOG_LEVEL=info`, the default). `APP_URL` must match the port the dev server listens on, because the link is built from it.

1. Open [`/register`](http://localhost:3000/register) (or "Create an account" on `/sign-in`), enter an email, "Send link".
2. Find the link in the `npm run dev` output: the `mail.sent` line with your address has `http://localhost:3000/verify-email#token=…` in its `text`. If you pipe the output to a file: `grep '"mail.sent"' dev.log | grep '<your email>' | tail -1 | grep -o 'http://[^ \\"]*verify-email#[^ \\"]*'`.
3. Open the link, type a password (12–128 characters; "Show password" shows it), "Set password and sign in" → `/mentors`, signed in.
4. "Sign out", then sign in on `/sign-in` with the email and password. A used or expired link shows "This link does not work any more" with "Send a new link".

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
| `npm run db:seed` | Create or restore the demo accounts (development only; see "Seed demo accounts") |
| `npm run invite -- <command>` | Mentor invitations: `create`, `list`, `resend`, `revoke` (see "Invite a mentor") |
| `npm run db -- migration:create` | Generate a migration from entity changes |
| `npm run db -- migration:up` / `migration:down` | Apply / roll back migrations |
| `npm run db -- <command>` | Any other MikroORM CLI command |

## For AI agents

Rules for coding agents start in [AGENTS.md](AGENTS.md): the rules every task needs and a task routing table ("when doing X, read Y"). Rules that apply to one package live next to it: [app](packages/app/AGENTS.md), [core](packages/core/AGENTS.md), [db](packages/db/AGENTS.md), [ui](packages/ui/AGENTS.md). Each `AGENTS.md` has a `CLAUDE.md` beside it that only imports it (`@AGENTS.md`), so Claude Code loads the same rules; other agents read `AGENTS.md` directly. Specs, run logs and lessons learned live in [.ai/](.ai/).
