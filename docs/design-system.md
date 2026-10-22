# DevMentor design system — read this first

Short version of the Storybook in `packages/ui` (`npm run storybook -w @devmentor/ui`, http://localhost:6006). An agent building a screen reads this file first, then the Storybook page of each component it uses.

## Character
Matter-of-fact, not generic. Dense where people scan (mentor and slot lists: thin lines, no cards per row), calm where people read (sessions). Shows what a mentor has built, never a score. Shows only data the product has. Sources: `lekcja-06/referencje.md`, `lekcja-06/tokeny.md`, `.ai/specs/product-brief.md`, specs #21–#28.

## Surfaces (which entry to use)
- Public pages (`(marketing)`: `/mentors`, `/m/[slug]`, `/invitation/[token]`, `/`): Tailwind only, import from `@devmentor/ui/mentors` only.
- Signed-in pages — `(auth)`, `(mentor)`, `(student)` (mentee pages such as favorites or sessions), `(admin)`: panel surface, import from `@devmentor/ui`; they may also use the Tailwind-only components from `@devmentor/ui/mentors` (e.g. `TagList`, `MentorTagFilter` with `basePath`).
- Interface language: English.

## Where things are
- Tokens: `packages/ui/src/tokens.css` (raw → semantic → component, light + `.dark`); Tailwind mapping in `packages/ui/src/styles.css`.
- Components: `@devmentor/ui` (panels, auth, admin; shadcn base restyled) and `@devmentor/ui/mentors` (public pages, Tailwind only, no Radix).
- Storybook: `packages/ui/.storybook`, stories in `packages/ui/stories/` (Design system, Foundations, Primitives, Product, Patterns, Screens).
- Progress and decisions: `packages/ui/POSTEP.md`.

## Components
| Component | Import | When | When not |
|---|---|---|---|
| Button (`intent` primary/neutral/destructive × `appearance` filled/outline/soft/text, `size` lg/md/sm/xs, `loading`) | `@devmentor/ui` | An action on this screen; one filled primary per screen | Navigation |
| TextLink | `@devmentor/ui` | Navigation from text (always underlined) | Actions |
| Field + Input / Textarea / Checkbox / Select | `@devmentor/ui` | Every form control, with a visible label | Placeholder as label |
| CrudForm | `@devmentor/ui` | Every create/edit form (blur + submit validation, focus first error, Cancel before primary) | — |
| Card | `@devmentor/ui` | One self-contained block | List rows, nested cards |
| Badge (`tone` neutral/success/warning/danger) | `@devmentor/ui` | State of one object, icon + word | Ratings, facts, counts |
| Alert (`tone`) | `@devmentor/ui` | Page-level message with next step | Field errors |
| Dialog / AlertDialog | `@devmentor/ui` | Short input / destructive confirmation (focus on Cancel) | Long flows |
| DropdownMenu | `@devmentor/ui` | 3+ row actions | 1–2 actions |
| Table / DataTable | `@devmentor/ui` | Records to compare in panels | Public mentor list |
| EmptyState / ErrorMessage / LoadingMessage / Skeleton | `@devmentor/ui` | Every data region | — |
| ReadinessChecklist, ProfileActions, CopyShareLink, SlotsPanel, SignInPanel, PayoutStatusPanel | `@devmentor/ui` | E01 screens | Public pages |
| MentorCard, MentorTagFilter, MentorListSkeleton, MentorPageView, MentorAvatar, SessionFacts, TagList, TextSessionNotice, LocalTime, InvitationPanel, buttonVariants | `@devmentor/ui/mentors` | Public pages | — |

## Semantic tokens (Tailwind classes)
- Colour: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `bg-primary` / `text-primary-foreground` (one main action), `text-link`, `text-destructive`, `text-success`, `text-warning`, `border-border` (decorative lines), `border-input` (control outlines), `focus-visible:focus-ring`, `bg-disabled` / `text-disabled-foreground`.
- Type: `text-display`, `text-heading-1…4`, `text-body-large`, `text-body`, `text-body-small`, `text-label`, `text-caption`; code and prices `font-mono tabular-nums`.
- Space (5 steps): `*-related` 8, `*-paragraph` 16, `*-panel` 24, `*-component` 32, `*-section` 48.
- Shape: `rounded-control` 8, `rounded-button` 10, `rounded-card` 12, `rounded-panel` 16, `rounded-checkbox` 4; `shadow-overlay` only for popovers, menus, dialogs.
- Motion: `duration-control` 120, `duration-menu` 180, `duration-dialog` 240 (zero with reduced motion).
- Width: `max-w-measure` (65ch) for running text; `w-phone` (320 px) for narrow-screen stories.

## If… then use
- Changes data → Button. Goes elsewhere → TextLink. Icon only → Button `iconOnly` + `aria-label`. 3+ row actions → DropdownMenu.
- One of ≤4 always visible → links (filter). One of 5+ → Select. Several of a few → Checkbox group (`multiselect`).
- Field wrong → Field error. Page needs attention → Alert. Region failed → ErrorMessage + Try again. Never a toast for errors.
- Loading > 400 ms → Skeleton; action running → Button `loading`.
- Many comparable records in a panel → Table; people on public pages → MentorCard list.

## Lists and row actions (from the agent test, 2026-10-22)
- People and saved items are rows separated by thin lines (MentorCard style); `DataTable` is for record tables in panels. The name in a row is the link to the profile (`/m/<slug>`); secondary line `text-body-small text-muted-foreground`.
- Row actions: one action → Button `appearance="text"`, several → `appearance="soft"`; size `sm` in dense rows and tables, `md` in forms and panels. The accessible name includes the object ("Remove Marta Kowal from favorites").
- Confirm only when the action cannot be undone in one click or affects other people (remove a bookable slot, revoke an invitation, unpublish). Removing from your own list (favorites) needs no confirmation: remove the row, show a status line above the list ("Removed Marta Kowal from favorites." + Undo button), move focus to the next row's action or, if none, the list heading. *Proposal.*
- A failed row action shows its error under that row (`text-caption text-destructive`) with Try again; never an Alert above the list or a toast. *Proposal.*
- Empty private list ("nothing saved yet"): hide the filter, show `EmptyState` with the next step; "nothing for this filter": keep the filter, `EmptyState` with a link to All. Public `/mentors` always shows the filter (spec #27).
- Headings: page `h1` → `text-heading-1`; section `h2` → `text-heading-2`; panel `h3` → `text-heading-3`; row titles keep their semantic level (`h2`/`h3`) but use `text-heading-4`.

## Avoid
- Ratings, stars, "top", "popular", counts (N02); sales look (A03); "available now" / "guaranteed"; booking or video controls before their epics.
- Generic AI look (A01): gradients, glass/blur, glow, emoji or sparkles as icons, three identical icon cards, pills, card in card, shadows as separators, everything centred, invented numbers.
- Implementation: hex/rgb/oklch, `bg-zinc-*`, `text-white`, `p-[13px]` outside `tokens.css`; variants added on the way; `div` buttons; placeholder labels; colour-only status; disabled buttons without a reason; needed info in tooltips.

## Commands
`npm run storybook -w @devmentor/ui` · `npm run build-storybook -w @devmentor/ui` · `npm run test:storybook -w @devmentor/ui` (a11y in light and dark) · `npm run check:tokens` · `npm run validate`.
