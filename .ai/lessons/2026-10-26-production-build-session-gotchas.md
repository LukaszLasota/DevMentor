# Production-build gotchas found by the first signed-in integration tests (2026-10-26)

Task 1.10 (Epic 01). Unit tests (mocked `em`, mocked `cookies()`) and `next dev` were green; the first
signed-in page under `next build && next start` returned "This page couldn't load".

Debug aid: `DEBUG_APP_LOGS=1 npm run test:integration` prints the app log at teardown; a browser
error page alone shows only a digest.

## 1. MikroORM entities across Next server bundles (minified class names)

- Symptom: `MetadataError: Metadata for entity l not found` on a page, after a route handler
  (the GitHub callback) had already initialised the ORM.
- Cause: route handlers and pages are separate server bundles, each with its own copy of
  `@devmentor/db`'s entity classes (workspace package, transpiled, not external). The ORM is one per
  process (`globalThis`), discovered with the first bundle's classes. MikroORM's
  `MetadataStorage.find` matches the class reference, then falls back to the class name — and the
  minifier names `User` differently in each bundle.
- Fix: `experimental.serverMinification: false` in `next.config.ts` (names stay `User`). `next dev`
  never minifies, so dev cannot reproduce it.

### 1b. Same root cause in `next dev`: `instanceof AppError` (found in the phase 1 manual test)

- Symptom: GitHub persona `mock-unverified` under `next dev` → `/sign-in?error=unexpected`, log
  "Unhandled redirect error" with a `GithubEmailUnverifiedError` (an `AppError` subclass).
- Cause: the container (`globalThis`, one per process) was built by a page's bundle (`ssr/` chunk),
  so `GithubOAuthService` threw that bundle's `AppError`; `redirectHandler` in the route bundle
  checked `instanceof` against its own copy → not an `AppError` → unexpected. Not minification:
  the classes are different objects with the same name, so `next dev` shows it too. The production
  integration build happened not to split it.
- Fix: `AppError` instances carry `Symbol.for('devmentor.app-error')`; `isAppError` /
  `isValidationError` replace `instanceof`. Rule: any check on our own classes that can cross the
  container boundary uses a registry-symbol brand or shape, never `instanceof`. Third-party code is
  fine when it is external (`serverExternalPackages`: MikroORM) or identity-independent (zod 4's
  `Symbol.hasInstance` checks `_zod.traits`) — verify, don't assume.
- Regression test pattern: `vi.resetModules()` + `await import('./errors')` gives a foreign copy.
- Hot reload does not fix a running `next dev`: the cached container keeps the old classes —
  restart the dev server after changing anything the container holds.

## 2. Session check in the App Shell prerender (`cacheComponents`)

- Symptom: `Route "/mentors": Next.js encountered the unstable value new Date() while prerendering`,
  logged at request time, from `verifyToken`.
- Cause: Next also prerenders cookie-reading routes for the App Shell; `cookies()` does not stop
  that, and a live check (clock, DB) must not run there.
- Fix: `await connection()` (`next/server`) right after `cookies()` in `readPageSession`.

## 3. Concurrent first GitHub sign-in: race between two lookups

- Symptom: 1 in ~4 runs of two parallel callbacks for the same new login ended on
  `github_account_conflict`.
- Cause: not the insert race (that one was handled) but the window between `findOne({ githubId })`
  (nothing yet) and `findOne({ email })` (the winner's row, committed in between, with our
  `github_id`) → rule 3.
- Fix: an email row whose `github_id` equals the profile's is rule 1. The integration test runs 4
  parallel callbacks.

## 4. agent-browser clicks right after `open`

`click` refused "covered by <div.flex.flex-col>" while the streamed page was still settling; wait for
the expected text and `wait --load networkidle` (`browser.waitForIdle()`) before clicking.
