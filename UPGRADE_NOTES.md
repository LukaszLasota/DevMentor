# Upgrade notes

What an operator does to move a running DevMentor to a new version, and how to go back. The newest version is on top.

Every version is a tag `vX.Y.Z` with a GitHub Release, both made by the Release workflow (README § Releasing); deploy from the tag, never from a branch.

## 1.0.0 — first release (draft, lesson 22)

There is no earlier released version, so 1.0.0 is a fresh install. These notes also define the procedure every later release follows.

### Before deploying
- Back up the database (`pg_dump -Fc`), and record the deployed tag and the last applied migration (`npm run db -- migration:list`).
- Set every variable in `.env.example`. Production refuses to serve (at the first request) without `SESSION_SECRET` and `APP_URL`, without `MAIL_API_KEY` and `MAIL_FROM` when `MAIL_PROVIDER=resend`, and with `TRUSTED_PROXY_HOPS=0` (T-12). A half-set or malformed `PLATFORM_CURRENCY` / `PLATFORM_PRICE_BOUNDS` pair refuses boot. The rest is not enforced at boot but the product needs it: `PLATFORM_CURRENCY` and `PLATFORM_PRICE_BOUNDS` (unset = prices cannot be saved and no mentor is bookable), `MAIL_PROVIDER=resend` (the log mailer delivers nothing), the GitHub OAuth app, `OPERATOR_EMAILS`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. With the Docker deploy, also `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` (commented in `.env.example`), matching `DATABASE_URL` with host `postgres`.
- Register the Stripe webhook endpoint `/api/webhooks/stripe` for the events in `.ai/specs/implemented/2026-11-20-booking-stripe-checkout.md`.

### Deploy
The documented production path is Docker Compose (README § Deploy to a VPS): `DEVMENTOR_TAG=<tag> docker compose -f docker-compose.prod.yml up -d --build` builds the images, the one-shot `migrate` service runs `npm run db:migrate`, and `app` starts only after it succeeded. Without Docker, the same steps by hand:

1. Build the tag: `npm ci && npm run build`.
2. Apply migrations: `npm run db:migrate` (15 migrations, `Migration20261026112548` … `Migration20261124100000`; every one has `down`).
3. Start the app and check `/api/health` (database `up`).
4. An operator opens batch 1 on `/admin/invitations` before the first invitation; `npm run invite -- create` refuses until then.

### Roll back
- **Code only** (no new migration in the release): redeploy the previous tag.
- **With migrations**: stop the app, run `npm run db -- migration:down` once per migration the release added (newest first), deploy the previous tag, start it, check `/api/health`. All 1.0 migrations are additive, so `down` drops only what the release added; data written into those tables and columns is lost, so take the backup first.
- **Restore** from the `pg_dump` when a `down` is not enough.

### Breaking changes
None (first release). From 1.0.0 on, every breaking change follows `BACKWARD_COMPATIBILITY.md` and gets a section here with its migration and rollback.
