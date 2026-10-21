# A mentor fills a page with public work and stack tags and gets a share link

Status: approved
Issue: #23 (E01-S03) · Epic: #16 · Depends on: #22 (`.ai/specs/2026-10-21-mentor-invitations.md`) · Source: `.ai/specs/product-brief.md` (R04, N02, R08, D24, R13) · Builds on: `.ai/specs/2026-10-21-platform-primitives.md`, `.ai/specs/2026-10-21-sign-in-github-and-email.md`, `.ai/specs/2026-10-21-mentor-invitations.md` · Follows the course reference specs `2026-09-08-mentor-page.md`, `2026-09-08-mentors-become-bookable.md` (Slice 2) and `2026-09-08-platform-primitives-ii.md` (lesson 05), adapted to this repository

## 📝 TLDR
An invited mentor (#22) has an empty `MentorProfile` and nothing a mentee could open. On `/mentor/profile` the mentor saves a display name, a link to public work, a plain description (`bio`) and one to four stack tags from TypeScript, React, Python, AI agents; saving drafts is always allowed, and **publishing** is gated on all four being present, with the missing item named on its field. The first publish generates a slug that never changes, and the mentor sees a share link `${APP_URL}/m/<slug>` with a copy button that a signed-out visitor can open. No rating, score, review or ranking appears anywhere. Unpublish hides the page (true HTTP 404) and keeps the slug.

## 📝 Problem Statement
The senior engineers interviewed answer questions unpaid and want their own link and no ratings (R04, N02: "my GitHub is my profile"). R08 makes the share link one of the two ways a mentee finds a mentor, and D24 limits stack tags to the beachhead. After #22, `mentor_profiles` holds only `user_id` and `initial_publish_due_at`; no mentor can be shown to anyone, so prices (#24), slots (#25), the list (#27) and the share-link page (#28) have nothing to attach to. This story also lands four reusable patterns (owner-scoped singleton, public projection, controlled vocabulary, readiness primitive), which makes it heavier than its UI suggests.

## 📝 Proposed Solution
Widen `MentorProfile` with the page fields, a nullable unique slug and `published_at`; add the readiness primitive and the publish gate `mentorPagePublishable`, evaluated once and used twice — the service refuses `publish` (and edits that would break a published page) with `fieldErrors` keyed by form field names, and the page renders the same list as a checklist. The slug is generated on first publication from the display name, retried on collision, and never changes. The public page `/m/[slug]` resolves existence before streaming and renders an explicit allowlist projection.

**In scope:** page fields; the stack-tag vocabulary; the readiness primitive, the publish gate and the shared bookability definition; slug on first publish; `unpublish`; `/mentor/profile` (form, checklist, publish/unpublish, share link with copy, preview); `/m/[slug]`; the page step on `/mentor`; the `mentors.profile.published` event; an additive `headers` option on `apiHandler`.
**Out of scope:** prices (#24) and slots (#25), which add fields and readiness requirements additively; the mentor list (#27); booking actions (#29); any rating, review or ranking (N02); slug renaming or redirect aliases (not in 1.0); prefilling tags from the invitation; recording page visits (Q10).

Alternatives considered:
- **Fields required on save** (the issue's criterion 2 read literally). Rejected, as in the course: a half-finished draft would be unsavable and the "missing link is named" check unreachable at publish. Completeness belongs to the publish transition.
- **Slug from the user id or a random string.** Rejected: a share link is read by people; the course and comparable products (GitHub, Calendly, ADPList) use a readable, stable handle.
- **Slug that follows the display name.** Rejected: printed and posted links would break on a rename.
- **Publish implied by save.** Rejected: a draft would be public the moment the first field is typed.

## 📝 Architecture
- `packages/core/src/domain/` — new folder, created by this story (client-safe, no `server-only`, no I/O):
  - `vocabulary.ts` + `vocabularies/stack-tags.ts` — `StackTags` (keys `typescript`, `react`, `python`, `ai-agents`; labels TypeScript, React, Python, AI agents): one definition feeding the Zod enum, labels and picker options. #22's merged migration is **not** edited; its `invitations.stack_tags` CHECK must use the same keys, and this story's drift test asserts both CHECK literals (`invitations`, `mentor_profiles`) equal `StackTags` keys. `invite-cli`'s `--tags` parsing switches to `StackTags` (code only, no schema change).
  - `slug.ts` — pure `slugify(name)` (`normalize('NFKD')`, combining marks stripped), `RESERVED_SLUGS`, `slugCandidate(base, attempt)`; persistence and retries stay in the service.
  - `readiness.ts` — `defineReadiness(requirements)`, `evaluate(subject) → { key, met }[]` (plain data), `assert(subject)` throwing `ValidationError` with `fieldErrors` keyed by requirement key.
- `packages/core/src/services/mentors/readiness.ts` — the one place mentor readiness is declared:
  - `mentorPagePublishable`: `displayName`, `publicWorkUrl`, `bio`, `stackTags` (≥ 1); keys equal the form field names.
  - `mentorOfferReady`: the single bookability gate (name fixed by #24). This story declares it with `published`; #24 adds `settings`, `price25`, `price50` (set and within current bounds), #25 adds `hasBookableSlot`. #27 (list), #28 (share page) and #29 (booking) read `mentorOfferReady`; no story declares a second gate or a boolean.
- `packages/core/src/services/mentors/mentor-profile.service.ts` — `getOwn(userId)`, `updateOwn(userId, input)`, `publish(userId)`, `unpublish(userId)`, `getPublicBySlug(slug)`; projections `toOwnerDto` / `toPublicDto` built from explicit keys. Scoped, `{ em, clock, events, env }`; registered in `container.ts` + `cradle.ts`. The owner id always comes from `requireSession`, never from the request.
- `packages/core/src/validators/mentors/mentor-profile-update.schema.ts` — shared by route and form.
- `packages/core/src/events/` — gains `mentors.profile.published { mentorProfileId, slug }`, emitted after commit only when this call moved `published_at` from null to set (first publish or republish).
- `packages/core/src/http/apiHandler.ts` (additive) — `ApiHandlerOptions.headers?: Record<string, string>`, set on every response of that route (success and error). Existing handlers are unchanged. The owner routes pass `{ 'Cache-Control': 'no-store' }`; #22's `no-store` / `Referrer-Policy` headers use the same option.
- `packages/db/src/entities/mentors/mentor-profile.entity.ts` widened; one migration with `up` and `down`.
- `packages/app/src/app/api/mentors/me/route.ts` (`GET`, `PUT`), `…/me/publish/route.ts`, `…/me/unpublish/route.ts` (`POST`), `api/mentors/[slug]/route.ts` (`GET`, public) — all `apiHandler` with `requireSession` + `requireRole(user, 'mentor')` on owner routes. No `export const dynamic`.
- `packages/app/src/app/(mentor)/mentor/profile/page.tsx` — calls `requirePageRole('mentor')` itself, reads the owner DTO through `withScope`, passes vocabulary options and `APP_URL` as props. Colocated client parts: `ProfileActions.tsx` (publish/unpublish through `apiCallOrThrow`, then `router.refresh()`), `CopyShareLink.tsx` (one consumer, placement rule 4).
- `packages/app/src/app/(mentor)/mentor/page.tsx` — gains the page step (checklist items linking to `/mentor/profile`).
- `packages/app/src/app/(marketing)/m/[slug]/page.tsx` — public, Tailwind. True 404 under Next 16 `cacheComponents` (per `next/dist/docs/01-app/02-guides/streaming.md` "The HTTP contract": the status is committed when streaming starts, and a `notFound()` thrown after a `<Suspense>` fallback renders only adds `noindex` to a 200): the page awaits `params`, calls `getPublicBySlug` through `withScope` and calls `notFound()` **before** any `<Suspense>` boundary, and declares `export const instant = false` (the documented "allow a blocking route" option, not `dynamic`) so `next build` accepts the request-time read outside Suspense. No `loading.tsx` in the segment or its parents, no `generateStaticParams`, no `use cache`; the build never touches the database.
- `packages/ui/src/components/mentors/MentorPageView.tsx` — the page body, Tailwind only (no shadcn), shared by `/m/[slug]` and the owner preview. Props are exactly the public shape (`MentorPublicView`, mirrored in `ui` types and kept in sync with `toPublicDto`); the owner preview passes the public keys picked from the owner DTO, never the owner DTO itself. Exported through a new `@devmentor/ui/mentors` entry (`packages/ui/package.json` `exports["./mentors"]`); an ESLint `no-restricted-imports` rule forbids the `@devmentor/ui` root (admin barrel) in `packages/app/src/app/(marketing)/**`.
- `packages/ui/src/backend/feedback/ReadinessChecklist.tsx` — renders `evaluate()` output with a text state per item and an optional UI-side `actionsByKey` map.
- `packages/ui/src/backend/forms/CrudForm.tsx` — new `multiselect` field type: a labelled checkbox group over `options`, value `string[]`, using the existing shadcn `checkbox`.
Boundaries: `ui` never imports `core` or `next` (options, readiness and the public view arrive as props); `db` hand-writes the `stack_tags` CHECK literal, held in sync by the drift test.

## 📝 Data Model
`mentor_profiles` (widened; existing `id`, `user_id`, `initial_publish_due_at`, timestamps unchanged)
| Column | Type | Notes |
|---|---|---|
| display_name | varchar(80) null | trimmed, 1–80; shown on the page and the slug base |
| public_work_url | text null | R04; `http`/`https` only, ≤ 2048, no embedded credentials |
| bio | text null | R04's plain description; 1–2000; `CHECK (char_length(bio) <= 2000)` |
| stack_tags | text[] not null default `'{}'` | `CHECK (stack_tags <@ ARRAY['typescript','react','python','ai-agents']::text[])`; duplicates normalized by the service |
| slug | varchar(60) null | unique, constraint named `mentor_profiles_slug_key`; set once on first publish, never changed or cleared |
| published_at | timestamptz null | non-null ⇒ public; `CHECK (published_at IS NULL OR slug IS NOT NULL)` |

A draft has no slug and no public route. Invitation acceptance (#22) keeps creating an empty profile unchanged. Email, `github_login`, invitation and `initial_publish_due_at` never cross the public projection; `users.avatar_url` does (see UI).

## 📝 API Contracts
| Route | Auth | Body | Answer |
|---|---|---|---|
| `GET /api/mentors/me` | `mentor` | — | owner DTO |
| `PUT /api/mentors/me` | `mentor` + CSRF | `mentorProfileUpdateSchema` | owner DTO; on a **published** profile an edit whose merged result fails the gate → 400 `VALIDATION_ERROR` with `fieldErrors`, nothing saved |
| `POST /api/mentors/me/publish` | `mentor` + CSRF | — | owner DTO; gate unmet → 400 `VALIDATION_ERROR` with `fieldErrors` per missing item; slug attempts exhausted → 409 `CONFLICT` (retryable) |
| `POST /api/mentors/me/unpublish` | `mentor` + CSRF | — | owner DTO with `publishedAt: null`, slug kept |
| `GET /api/mentors/[slug]` | public | — | public DTO; unknown, unpublished, or owner no longer `mentor` → 404 `NOT_FOUND` |

- `mentorProfileUpdateSchema` — every field optional (omitted = unchanged); an empty string clears to `null`: `displayName` string trim 1–80; `publicWorkUrl` trimmed URL with `http:`/`https:` protocol, empty `username` and `password`, ≤ 2048; `bio` string 1–2000; `stackTags` array of `StackTags` keys, max 4. Shape only; completeness is the gate's job.
- `updateOwn`, `publish` and `unpublish` each run in one transaction holding the profile row lock (`SELECT … FOR UPDATE`). `updateOwn` on a published profile merges the input onto the locked stored state and runs `mentorPagePublishable.assert` on the merged state before writing, so an edit cannot race a publish/unpublish into an unpublishable public page.
- Public DTO: `{ slug, displayName, avatarUrl, publicWorkUrl, bio, stackTags }` (`avatarUrl` from `users.avatar_url`, nullable). #24 and #25 add fields additively. Held by a key-equality test (`expectProjectionKeys`), never a subset check.
- Owner DTO: public fields (slug nullable) + `publishedAt`, `initialPublishDueAt`, `readiness: { key, met }[]` (publish gate).
- Slug rules: `slugify` applies `normalize('NFKD')`, strips combining marks, lower-cases, maps non-alphanumerics to `-`, collapses and trims dashes; empty result → base `mentor`. Candidates: attempt 1 is the base, attempt n is `base-n`, with the base truncated so the candidate never exceeds 60. `RESERVED_SLUGS = ['me']` only — `/api/mentors/me` would shadow `/api/mentors/[slug]`; `/m/<slug>` has no sibling routes, so nothing else collides. The reserved check runs on the final (truncated, suffixed) candidate; a reserved candidate is skipped to the next attempt. `publish` locks the row, tries one candidate per transaction, retries only on a violation of `mentor_profiles_slug_key` in a fresh transaction, up to `MAX_SLUG_ATTEMPTS = 100`, then 409. Concurrent publishes of one profile serialize on the lock; the follower sees `published_at` set, returns the owner DTO and emits no event.
- Errors use this repo's codes (`VALIDATION_ERROR` 400, `NOT_FOUND` 404, `CONFLICT` 409). Owner routes send `Cache-Control: no-store` through `apiHandler`'s `headers` option.

## 📝 UI/UX
- **`/mentor/profile`** (app surface, shadcn): `CrudForm` bound to `mentorProfileUpdateSchema` — Display name, Link to your public work, What you have done (textarea), Stack tags (`multiselect`, four options). Below it a `ReadinessChecklist` "Before you can publish", then **Publish** with the line "Publishing shows your name, GitHub avatar (if any), link, description and tags to anyone with the link." (#27 extends it additively, with a test, to "…, and lists you on /mentors while you have open times." — Q2 of #27/#28) A refused publish shows each message next to its field. A preview (`MentorPageView`) shows what visitors will see.
- After the first publish: the share link as text `${APP_URL}/m/<slug>` with a **Copy link** button (falls back to selecting the text when the clipboard API is unavailable), the line "This link stays the same if you change your name.", and **Unpublish** ("Hides your page; the link works again when you republish.").
- **`/mentor`**: the page step joins the publish-by checklist from #22, linking to `/mentor/profile`.
- **`/m/[slug]`** (public, Tailwind): display name; avatar as a plain `<img>` (not `next/image`: `ui` does not import `next`, and no image optimizer proxies a third-party host) with `referrerPolicy="no-referrer"`, `alt=""` (the name sits beside it), fixed size; `avatarUrl` null → the display name's first letter in a circle. Link to public work as `<a href>` with the full URL, `rel="noopener nofollow ugc"`, `target="_blank"`; its text is host + path without scheme, truncated to 60 characters with an ellipsis. Bio as plain text (no HTML or Markdown). Tag labels. Unpublished or unknown → the standard 404 with HTTP status 404. Prices (#24) and slots (#25) render only when the mentor is `mentorOfferReady`; otherwise the page shows only "Not bookable yet", with no prices and no slots (Q4 of #27/#28).
- **No score, rating, review, star or ranking** in any markup of these pages — asserted as absent, not merely omitted.
- Accessibility: the tag picker is a `fieldset` with a legend; checklist items carry a text state, not colour alone; the copy result is announced via `role="status"`.

## 📝 Edge Cases & Failure Scenarios
- Publish with no public-work link → 400, `fieldErrors.publicWorkUrl`, the checklist item stays unmet, nothing public.
- Two mentors both named "Ada Lovelace" publish at once → the unique constraint arbitrates; one gets `ada-lovelace`, the other `ada-lovelace-2`.
- Display name of only emoji or punctuation → base `mentor`; display name "Me" → `me-2`.
- Rename after publishing → slug unchanged; old links resolve.
- Unpublish, then republish → HTTP 404 while unpublished; the same slug afterward; the event fires again on republish.
- Publish twice at once (two tabs) → one slug, one `published_at`, one event.
- Published mentor clears any gate field (name, link, bio, all tags), alone or racing an unpublish/publish → 400; the page stays published with the previous content.
- `javascript:`, `data:` or `https://user:pass@host` URL → refused by the schema.
- Owner loses `mentor` (by-hand `revokeRole`) → public page 404 (fail closed); profile and slug kept.
- Mentor with no profile row (should not happen after #22) → owner routes 404; no implicit creation on read.
- Database unreachable → build unaffected; `/m/[slug]` and owner routes fail at request time (503 through `apiHandler` on routes; the error boundary on the page).

## ✅ Acceptance criteria
- Given a mentor, when they save a display name, a link to public work, a plain description and one or more of TypeScript, React, Python, AI agents and publish, then their page shows them. (R04, D24)
- Given the tag picker, then it offers exactly those four tags, and the API and database refuse any other value. (R08, D24)
- Given a mentor without a public-work link, when they try to publish, then the page is not published and the missing link is named on its field; saving the draft itself is allowed. (R04, negative)
- Given a published page, when the mentor clears any one gate field, then the edit is refused with that field named and the public page is unchanged. (R04, negative)
- Given any mentor page or the profile screen, then it shows no rating, score, review or ranking. (N02, negative)
- Given a published page, then the mentor sees a share link, and a signed-out visitor opening it sees the page. (R08)
- Given a draft that was never published, then it has no slug and `/m/<anything>` answers HTTP 404.
- Given a mentor who changes their display name after publishing, then the previously shared link still resolves.
- Given two mentors with the same display name publishing concurrently, then both get distinct, non-reserved slugs.
- Given a published page, when the mentor unpublishes, then `/m/<slug>` and `/api/mentors/<slug>` return HTTP 404; when they republish, the original slug resolves again.
- Given the public payload, then its keys equal exactly the public DTO allowlist (no email, GitHub login, invitation or publish deadline).

## 📝 Risks & Impact Review
`risk-high`: a schema migration and a new public route; `needs-qa`, second reviewer. Compatibility: additive columns and constraints on a table with only empty profiles (`up` and `down` exercised); new routes; new `@devmentor/ui/mentors` export entry, `multiselect` field type and `apiHandler` `headers` option (all additive per `BACKWARD_COMPATIBILITY.md`); no env changes (`APP_URL` exists). Security: the public projection is the main risk — allowlist plus key-equality test; owner identity only from the session; user-supplied URL limited to credential-free http(s) and rendered with `noopener nofollow ugc`; bio rendered as text; the avatar becomes public on publish, which the publish copy says, and loads with no referrer. Slugs are enumerable by design, so nothing non-public is reachable through one.

## 📝 Decisions in play
R04 / N02 (link to public work and plain description, no ratings — founder A), R08 / D08 (stack-tag list or share link, no ranking — founder A), D24 (beachhead tags — founder A), R13 / D13 (only invited mentors; the page is one step of the two-week publish ask). The issue's ids map to the course's N02/R04, D21/R13 and D24/R16.

## ✅ Resolved with the session owner (grill-me, 2026-10-21)
All follow the course.
- Q1: unpublished or unknown `/m/[slug]` is a true HTTP 404 — existence is resolved before streaming starts (`notFound()` before any `<Suspense>`, `instant = false`); `GET /api/mentors/[slug]` is 404 too.
- Q2: no slug renaming in 1.0; the slug is fixed from first publish (the former open question is closed; an operator rename by hand is not offered).
- Q7: one readiness definition. #23 owns the primitive (`evaluate` / `assert`, requirement keys) and `mentorOfferReady`; #24 adds the price requirements, #25 adds `hasBookableSlot`; #27 and #29 read the same definition.
- Recorded for the sibling stories (they own the details): Q3 currency and price bounds block #24's implementation (founder A); Q4 bounds tightened below a stored price make the mentor not bookable until they save again, and `/mentor` names the out-of-bounds price; Q5 a slot under 2 hours away is published and shown disabled but does not count toward D13; Q6 Stripe Connect moves to 1.1 and the fee/payouts to a settlement story.

## ✅ Resolved
Adopted from the course reference specs on 2026-10-21:
- Fields optional on save, completeness enforced at publish (and on edits of a published page) by a readiness gate whose keys are the form field names; the same gate renders as `ReadinessChecklist`.
- Slug nullable until first publish, generated in the publish transaction, immutable, with the named-constraint-only retry, fresh transactions, 100-attempt `ConflictError`, empty-name fallback `mentor`, a reserved list and the 60-character cap; a DB check that published implies slug.
- `unpublish` as the inverse transition, keeping the slug.
- Stack-tag vocabulary as one definition in `core/src/domain/`; the migration hand-writes the CHECK literal with a drift test.
- Explicit `toPublicDto` / `toOwnerDto` with a key-equality test; no generic projection helper.
- `MentorPageView` shared by the public page and the owner preview; `CrudForm` `multiselect` as a checkbox group; copy button colocated; `mentors.profile.published` event after commit; every `(mentor)` page calls `requirePageRole` itself; absence of ratings asserted negatively.

Conflicts between issue #23 and the course, resolved toward the course (recorded as a comment on #23 when the spec PR opens):
- Criterion 2 "saving is refused without a public-work link" → **publishing** is refused and the field named; saving a draft is allowed.
- Criterion 4 "given a saved page, the mentor sees a share link" → the share link appears after the first **publish**.

Deliberate differences from the course, each because our approved specs or code differ:
- (a) No `export const dynamic` (removed under `cacheComponents`, forbidden by `AGENTS.md`); `/m/[slug]` uses `instant = false` instead to get a true 404.
- (b) No `makeOwnedResourceRoute` / `ownedAction` and no session in the request scope: our approved specs define neither, so owner routes use `apiHandler` + `requireSession` + `requireRole` and pass the session user id to the service.
- (c) Readiness failures are 400 `VALIDATION_ERROR`, our existing code, not the course's 422.
- (d) A `display_name` column, required to publish: our `users` have no name, and the course derives the page title and slug from a display name. Gate has four items instead of three.
- (e) `bio`, `public_work_url` are new columns; the course's placeholder `headline` / `yearsOfExperience` are not adopted.
- (f) `/mentor/profile` loads data server-side through `withScope` instead of `useApiResource` + `ResourcePanel` (deferred until a client-fetched screen needs them); `GET /api/mentors/me` stays as the API contract.
- (g) `/m/[slug]` lives in `(marketing)` to reuse its public root layout; the URL is unchanged. No shadcn `badge`: the page is Tailwind-only.
- (h) Additions not in the course, derived from R04 and fail-closed: a published page cannot be edited into failing the gate, and a page whose owner no longer holds `mentor` is 404.
- (i) Reserved slugs reduced to `me` (the only real route collision here), so the `mentor` fallback is never reserved.

## 📝 Review notes
- `apiHandler` gained a named `headers` option rather than dropping `no-store`: the owner DTO carries private data, and #22 needs the same mechanism.
- #26 and `backlog.md` updates for Q6 are out of this file's scope (owned by #26's spec).

## 📋 Phasing
One phase, one PR; starts after #22 is merged, ships with Epic 01 by 2026-10-31. Unblocks #24, #25, #27, #28.

## 📋 Implementation Plan
1. `domain/vocabulary.ts` + `vocabularies/stack-tags.ts`; switch `invite-cli` tag parsing to it; tests for keys, labels, options, schema. `npm run validate`.
2. `domain/slug.ts`; tests: NFKD diacritics, punctuation, empty fallback `mentor`, `me` → `me-2`, reserved check after truncation, suffix-aware truncation at 60.
3. `domain/readiness.ts`; tests: all/some/none met, `fieldErrors` keying.
4. `apiHandler` `headers` option; tests on success and error responses, existing handlers unchanged.
5. Entity widening + migration (`up` and `down` exercised, the three CHECKs, named unique constraint); drift test: out-of-vocabulary tag and published-without-slug rejected, both `stack_tags` CHECK literals equal `StackTags` keys.
6. `mentorProfileUpdateSchema` in `@devmentor/core/validators`; tests per field, empty-string clearing, URL protocol, trimming, embedded credentials.
7. `services/mentors/readiness.ts` (`mentorPagePublishable`, `mentorOfferReady` with `published`) and `MentorProfileService`; event map entry; container + cradle; tests: update, published-page gate on the merged state with one test per cleared gate key, edit racing unpublish/publish under the row lock, publish happy path, gate failure, collision retry only on the named constraint, 100-attempt conflict, same-profile concurrency with one event, republish keeps slug and emits, public read 404s (unpublished, unknown, role revoked), `expectProjectionKeys` on both DTOs.
8. Routes (`/api/mentors/me`, `publish`, `unpublish`, `[slug]`); route tests: 401/403, CSRF, envelope, `no-store`, error codes.
9. `ui`: `CrudForm` `multiselect`, `ReadinessChecklist`, `MentorPageView` (avatar and null fallback, link text truncation, plain-text bio), `@devmentor/ui/mentors` export + ESLint rule; component tests at 100% coverage for each.
10. Pages: `/mentor/profile` with `ProfileActions` and `CopyShareLink`, the page step on `/mentor`, `/m/[slug]` (`notFound()` before Suspense, `instant = false`); component tests incl. absent rating/score/review/ranking text; `npm run build` with no database.
11. Integration (`mentor-page` test, fixture `seedPublishedMentorProfile`): invited mentor saves a draft without a link → publish refused with the field named → completes and publishes → signed-out visitor opens the share link and sees link, bio, tags → rename keeps the link → clearing the link is refused → unpublish gives HTTP status 404 → republish same slug → two equal names get distinct slugs → rating/score/review/ranking absent. `npm run test:integration`.
Each step ends with `npm run validate` at 100% coverage.
