# POSTEP — DevMentor design system

Prompt: `lekcja-06/prompt-storybook.md` (copy of `lekcja-06/storybook-devmentor.txt`). Branch: `lekcja-06-design-system` (from `main`).

## Status

| Stage | State |
|---|---|
| 0. Inventory and plan | done 2026-10-22, approved |
| 1. Foundations | done 2026-10-22, approved, committed e7c56a8 |
| 2. Base components | batch 1 of 4 done 2026-10-22, waiting for review ("dalej") |
| 3. Product components, patterns, screens | not started |
| 4. Teaching pages | not started |
| 5. Checks and report | not started |

**Next step:** review batch 1 in Storybook (Primitives/*), then batch 2: Select, Card/Panel, Status badge, Avatar, Alert, Skeleton.

## Stage 1 — what was built (2026-10-22)

- Installed (devDependencies of `@devmentor/ui`): `storybook`, `@storybook/react-vite`, `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-vitest` (all 10.6.3), `@vitest/browser` + `@vitest/browser-playwright` 5.0.5, `playwright` 1.64.1, `vite` 8.3.4, `@tailwindcss/vite` 4.3.3, `remark-gfm` 4.0.1. Dependencies: `@fontsource-variable/inter`, `@fontsource/dm-mono` 5.3.0. Playwright Chromium 1248 downloaded. `npm run audit`: no blocking advisories. `msw` is deferred to stage 3 (API simulation for patterns).
- `src/tokens.css`: raw → semantic → component layers, source comment on semantic tokens, light + dark, `.light` scope, aliases re-declared on `.dark`, motion zeroed under `prefers-reduced-motion`.
- `src/styles.css`: imports fonts and tokens; maps colours, fonts, ten text styles (`text-display` … `text-caption`), relation spacing (`p-panel`, `gap-related` …), radii (`rounded-control/button/card/panel`, shadcn `sm…4xl` mapped onto them until stage 2), `shadow-overlay`, `max-w-measure`. The values moved out of `styles.css` into `tokens.css` (approved "change" row).
- `.storybook/`: `main.ts` (react-vite, Tailwind plugin, `@` alias, remark-gfm for MDX tables, telemetry, what's-new and onboarding checklist off), `preview.tsx` (theme toolbar sets `dark` on `<html>` for stories and docs; `a11y: { test: "error" }`; menu order), `manager.ts` (brand title DevMentor only), `docs.css`, `blocks/` (documentation-only blocks reading live CSS variables).
- Foundations pages: Color (roles + contrast measured in both themes), Typography, Spacing and layout, Shape and depth, Motion, Icons, Themes. `Foundations/Color/Contrast check` story fails when any pair drops below threshold.
- Scripts: `npm run storybook -w @devmentor/ui` (port 6006), `build-storybook`, `test:storybook` (runs the stories as Vitest browser tests twice: `STORYBOOK_THEME=light` and `dark`); root `npm run check:tokens` (`scripts/check-tokens.mjs` + unit tests, exit 1 on findings, 2 on a missing path).
- `.gitignore` and ESLint ignore `**/storybook-static/`.

## Stage 1 — checks (2026-10-22)

- Contrast (measured in Storybook, light / dark): foreground 16.84 / 16.52, foreground on muted 15.71 / 15.11, muted-foreground 5.81 / 7.99, on muted 5.43 / 7.31, primary label 5.10 / 7.04, link 4.94 / 7.04, link on muted 4.61 / 6.44, destructive 5.89 / 6.64, destructive label 6.08 / 6.64, input 3.53 / 3.92, ring 4.94 / 7.04, border 1.31 / 1.40 (decorative, exempt). No pair below threshold.
- `npm run test:storybook`: 1 story × 2 themes passes (three consecutive runs). A deliberately low-contrast temporary story failed with `color-contrast`, so the a11y gate fails as intended. Known: the first run right after a change to preview imports can fail once while Vite re-optimises dependencies; a re-run passes.
- `npm run build-storybook`, `npm run validate` (lint, typecheck, 100% coverage, app build without DB, audit): pass. The only lint warning is pre-existing in `.agents/skills/om-share-this-session`.
- Browser (agent-browser): all Foundations pages at 320 px have no horizontal scroll; dark theme applies to docs pages and overlays via `<html>`.
- `npm run check:tokens` currently reports 26 findings: `packages/app/src/app/(marketing)/page.tsx` (default Next starter page: palette classes, hex, arbitrary sizes) and the shadcn primitives in `src/components/ui/*` (`text-white`, `-[3px]` rings). Primitives are restyled in stage 2; app code is fixed with the lesson's "Wartości spoza tokenów w aplikacji" prompt before the CI job is enabled.

## Stage 2 — differences from shadcn defaults (approved 2026-10-22)

| Trait | shadcn default | DevMentor | Source |
|---|---|---|---|
| Button API | 6 `variant`s | `intent` (primary, neutral, destructive) × `appearance` (filled, outline, soft, text) | trainer |
| Button sizes | 8 (24–40 px) | lg 40, md 36 (default), sm 32, xs 28; icon box 20 | trainer, Q1 |
| Button padding | Tailwind steps | component tokens 16/16/12/8 px | Q2 |
| Radii | `rounded-md`, `rounded-full` | `rounded-button` 10, `rounded-control` 8, `rounded-checkbox` 4 | tokens, Q3, A01 |
| Borders, shadows | `shadow-xs` | no shadows; fields outlined with `--input` | R03.2 |
| Focus | 3 px halo at 50 % | 2 px `--ring` outline, 2 px offset (`focus-ring`) | trainer; values proposal |
| Disabled | `opacity-50` | `--dm-disabled-fill` / `--dm-disabled-foreground` + visible reason | trainer |
| Loading | none | `loading` + `loadingLabel` (status region, `aria-busy`) | trainer |
| Hover / pressed | `/90` opacity | `--dm-action-primary-hover` #2a4ad6 / pressed #2140b8 (dark #9bb0ff / #b4c3ff); destructive hover via color-mix (proposal) | Q4 |
| Control text | `text-sm` | `text-label` (14, medium); inputs 16 px below `md` | typography Q3 |

## Stage 2 — batch 1 (2026-10-22)

- Restyled shadcn primitives: `components/ui/button.tsx` (new API), `input.tsx`, `textarea.tsx`, `checkbox.tsx`, `label.tsx`. Usages moved to the new API: `CrudForm`, `ErrorMessage`, `DataTable` (button order in `CrudForm` changes in stage 3, R03.4).
- New: `backend/forms/Field.tsx` (label, hint, error, required/optional, inline for checkboxes, wired ids) and `backend/navigation/TextLink.tsx` (always underlined, `external`, `asChild`). Home chosen per AGENTS.md rule 2 (generic, concept-agnostic → `backend/<category>/`); to confirm because public pages will use them too.
- Tokens added: hover/pressed/disabled colours, button and field sizes, checkbox size and radius, focus width/offset, `focus-ring` and `duration-*` utilities.
- Storybook: `.storybook/storybook.css` extends `hover`, `focus-visible`, `active` with `data-preview-state` (docs only). Pages with all 13 sections + stories (playground, variants, state matrix, long content / narrow, play tests): Button, Text link, Input, Textarea, Checkbox, Field.
- Checks: 29 stories pass the a11y test in light and dark. The state-matrix test caught low contrast of blue/red text on `--border` in outline/soft hover/pressed states; fixed (fill `--muted` or outline instead). Unit tests 193 pass, coverage 100 %, typecheck and lint clean, Storybook builds. `check:tokens`: 21 findings left (marketing page, `table.tsx` `-[2px]`).
- Example data follows the specs: password 12–128 (#21), display name 1–80, bio up to 2,000, stack tags TypeScript/React/Python/AI agents (#23). No currency in price examples (#24 blocked).
- `vitest.storybook.config.mts` pre-bundles story dependencies (otherwise the first run after a new import fails to load the story files).

## Open questions (stage 1)

- Proposals still open: dark action colour `#7d97ff`, overlay shadow values, text line heights and weights, chart colours (unchanged shadcn defaults).
- `(marketing)/globals.css` and the Geist fonts in the marketing layout are not changed yet (rule 11: app code); planned together with the app-token prompt.

## Inventory (2026-10-22)

- npm 10.9.8 workspaces, Node 22.22.3; Next.js 16.4.2, React 19.3.0, Tailwind 4, Vitest 5.0.5 (root `vitest.config.mts`, 100% coverage on `packages/*/src/**/*.{ts,tsx}` and `scripts/**/*.mjs`).
- `packages/ui`: shadcn/ui new-york (`components.json`, base color neutral, lucide icons), `radix-ui` 1.8, `class-variance-authority`, `tw-animate-css`. No Storybook.
- Tokens: no `tokens.css`; shadcn defaults live in `packages/ui/src/styles.css` (light + `.dark`, oklch, `--radius: 0.625rem`), imported by the admin root layout only.
- Primitives: `components/ui/{button,input,textarea,checkbox,label,table}.tsx` (shadcn defaults).
- Panel layer: `backend/forms/CrudForm.tsx`, `backend/tables/DataTable.tsx`, `backend/feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx`, `backend/api/apiCall.ts`.
- Public pages: `packages/app/src/app/(marketing)/globals.css` with its own `--background/--foreground`, Arial body font, Geist + Geist Mono via `next/font` in the marketing layout. Specs: public pages use Tailwind only, no shadcn (AGENTS.md, spec F1), via the `@devmentor/ui/mentors` entry.

## Decisions in ten lines (from `lekcja-06/referencje.md`, `lekcja-06/tokeny.md`)

1. Character: rzeczowy (matter-of-fact). Anti-character: generyczny (generic).
2. R01.1 dense rows separated by thin 1px lines, no cards/shadows per row; R03.2 thin lines instead of card borders and shadows.
3. R01.2 + R03.1 code, file names, logo and prices in mono (DM Mono), tabular figures for prices and times.
4. R01.3 warm greys instead of cold ones; action colour `#335cff` (`#7d97ff` dark), Inter for UI (tokens, trainer values).
5. R02.1–R02.3 conversation in the centre, input always visible, author and time on every message, instant send.
6. R03.3 short facts (session length, price) as separate chips; R03.4 form footer: Cancel first, then the primary action.
7. A01 generic AI look: no purple/indigo gradients, glass, sparkles, pills on everything, number pills, initials avatars on coloured backgrounds, invented numbers.
8. A02 no stars, averages or review counts (N02); A03 no "Most popular", urgency counters, feed or likes.
9. K1 dense on mentor and session lists, calm in the session view.
10. Spacing 8/16/24/32/48, radii 8/10/12/16, motion 120/180/240 ms, one overlay shadow (trainer values).

## Technical plan (proposal)

- Package: `packages/ui` (existing). Storybook config in `packages/ui/.storybook`.
- Storybook 10 with `@storybook/react-vite` (the `ui` package never imports `next`, so no Next framework needed), `@tailwindcss/vite` for Tailwind 4.
- Addons: `@storybook/addon-docs` (MDX + `remark-gfm` for tables), `@storybook/addon-a11y` (`a11y: { test: 'error' }`), `@storybook/addon-vitest` with Vitest browser mode + Playwright Chromium (stories run as tests; interaction tests via `play`), `msw` + `msw-storybook-addon` to simulate `/api/*` answers for `apiCall`/`CrudForm` (success, pending, field error, server error, offline).
- Scripts in `packages/ui/package.json`: `storybook`, `build-storybook`, `test:storybook` (both themes: run twice with a theme global), root `check:tokens` (`scripts/check-tokens.mjs`, fails on hex/rgb/hsl/oklch outside the token file, Tailwind palette classes and arbitrary values; ships with a unit test because `scripts/**/*.mjs` is under 100% coverage).
- Tokens: new `packages/ui/src/tokens.css` (raw → semantic → component layers, source comment on every semantic token, light + dark), imported by `styles.css` (admin) and `(marketing)/globals.css` (public) so both surfaces share one set.
- Fonts: Inter + DM Mono bundled with the project (no CDN) — see question 2.
- Version compatibility of Storybook 10 / addon-vitest with Vitest 5 is checked at the start of stage 1; if incompatible, stage 1 stops and asks.

## Component plan (derived from the specs' screens)

Screens in E01/E02 specs: `/sign-in`, `/register`, `/verify-email`, `/invitation/[token]`, `/mentor` (onboarding steps), `/mentor/profile`, `/mentor/prices`, `/mentor/slots`, `/mentor/payouts` (+ `/return`, `/reauth`, 1.1), `/admin`, `/admin/users`, `/admin/payouts`, `/mentors`, `/m/[slug]`.

**Primitives** (shadcn base, restyled):

| Component | Needed by |
|---|---|
| Button (exists) | every form, `/m/[slug]` book action (E03), admin actions |
| Text action / Link | `/sign-in` ↔ `/register`, public-work link on `/m/[slug]`, `MentorCard` |
| Input (exists) | sign-in, register, profile, prices |
| Textarea (exists) | `/mentor/profile` bio |
| Select | `/mentor/prices` currency (if not fixed), admin filters |
| Checkbox (exists) | `/mentor/profile` stack tags (multi) |
| Label + Field (label, hint, error, required/optional) | all forms (CrudForm) |
| Card / Panel | `/mentor` steps, `/invitation/[token]`, auth pages |
| Status badge | invitation state, Connect state, slot "not bookable yet", profile published/draft |
| Avatar (neutral fallback) | `/m/[slug]`, `MentorCard` |
| Alert | verify-email notice, invitation expired, page-level errors |
| Dialog + Confirm dialog | remove slot, revoke invitation, unpublish profile |
| Menu | admin user row actions |
| Skeleton | `MentorListSkeleton`, slot table loading |
| Empty state / Error state / Loading (exist in `backend/feedback`) | `/mentors` empty and unknown tag, `/mentor/slots` none yet |
| Table (exists, via DataTable) | `/mentor/slots`, `/admin/users`, `/admin/payouts` |

Not planned (no screen needs them in E01/E02; listed on "What is missing"): Radio group, Switch, Popover, Tooltip, Tabs, Toast.

**Product components** (per epic):

| Epic | Component | Screen |
|---|---|---|
| E01 | `SignInPanel` (GitHub first, email fallback) | `/sign-in`, `/register` |
| E01 | `InvitationCard` | `/invitation/[token]` |
| E01 | `OnboardingSteps` (profile → prices → slots → payouts) | `/mentor` |
| E01 | `StackTagPicker` | `/mentor/profile` |
| E01 | `PriceFields` (25/50 min, mono, tabular) | `/mentor/prices` |
| E01 | `SlotTable` + `SlotPublishForm`, `LocalTime` | `/mentor/slots` |
| E01 | `ConnectStatus` (1.1) | `/mentor/payouts` |
| E02 | `MentorCard`, `MentorTagFilter`, `MentorListSkeleton` | `/mentors` |
| E02 | `MentorPageView`, `PriceChips`, `PublicSlotList` (disabled slot with visible reason) | `/m/[slug]` |

**Patterns:** form (CrudForm), list with filters (`/mentors`), detail view (`/m/[slug]`), delete confirmation (remove slot), backlog patterns: onboarding checklist (`/mentor`), auth (sign-in/register/verify), invitation acceptance.

## Storybook menu (≈ 280 stories)

```
Design system/  Start here · Components · How to choose · Usage and accessibility · Content
                What to avoid · What is missing · Contributing · E01 Mentor onboarding · E02 Finding a mentor
Foundations/    Color · Typography · Spacing and layout · Shape and depth · Motion · Icons · Themes
Primitives/     ~17 components × ~6 stories ≈ 100
Product/E01/    ~8 components × ~6 ≈ 50
Product/E02/    ~6 components × ~6 ≈ 36
Patterns/       ~7 patterns × ~6 ≈ 40
Screens/        14 screens × ~3–4 states ≈ 50
```

## Existing design system: keep / change / remove (for approval)

| Item | Proposal | Why |
|---|---|---|
| `styles.css` shadcn defaults | change: values come from new `tokens.css`; keep shadcn variable names | tokeny.md maps decisions onto existing names; defaults are the generic look (lesson 06) |
| `--radius` calc scale (7 radii) | change: replace with `--radius-control/button/card/panel` | tokeny.md: 4 radii |
| `components/ui/*` | keep files, restyle in stage 2 | rule 2: must not look like default shadcn |
| `backend/forms/CrudForm` | change in stage 3: Cancel before primary, focus first error | R03.4, lesson 06 form pattern |
| `backend/feedback/*`, `DataTable` | keep, restyle, document | already the sanctioned renderers (AGENTS.md) |
| `(marketing)/globals.css` | change: import tokens, drop own colours and Arial | one token set for both surfaces (tokeny.md gap) |
| Geist / Geist Mono in marketing layout | change to Inter / DM Mono | tokeny.md (trainer) |
| nothing | remove | — |

## Open questions (stage 0)

1. Where stories live: colocated `*.stories.tsx` in `src/` would fall under the 100% coverage gate (needs a coverage exclusion = your approval), or `packages/ui/stories/` outside `src/` (no exclusion). Proposal: `packages/ui/stories/`.
2. Fonts: add `@fontsource-variable/inter` and `@fontsource/dm-mono` to `packages/ui` (self-hosted, used by Storybook and the app) instead of `next/font`? Proposal: yes.
3. Typography: only Display 56 and Caption 12 are known; proposal for the 8 middle styles: Heading 1 40, Heading 2 32, Heading 3 24, Heading 4 20, Body large 18, Body 16, Body small 14, Label 14/medium (propozycja).
4. Avatar fallback from spec #23 (initial) vs A01 (initials on coloured backgrounds): proposal — initial on `--muted` with `--foreground`, never a colour per person.
5. Not planned primitives (Radio, Switch, Popover, Tooltip, Tabs, Toast): OK to leave them on "What is missing" until a screen needs them?

## Approved decisions

- 2026-10-22 Q1: stories live in `packages/ui/stories/` (outside `src/`, no coverage exclusion).
- 2026-10-22 Q2: fonts from Fontsource in `packages/ui` (Inter, DM Mono), no CDN.
- 2026-10-22 Q3: typography scale accepted: Display 56, Heading 1 40, Heading 2 32, Heading 3 24, Heading 4 20, Body large 18, Body 16, Body small 14, Label 14 medium, Caption 12.
- 2026-10-22 Q4: avatar fallback = initial on `--muted` with `--foreground`, never a colour per person.
- 2026-10-22 Q5 (default, not objected): Radio, Switch, Popover, Tooltip, Tabs, Toast go to "What is missing".
