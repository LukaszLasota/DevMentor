# packages/ui — components and panel layer

Standalone React components: shadcn primitives, the panel layer `backend/`, concept components. Imports nothing internal — never `@devmentor/core`, not even its validators. Paths below are relative to the repo root.

## Design system

- Read `docs/design-system.md` before building any screen; components, tokens and rules are documented in the Storybook in `packages/ui` (`npm run storybook -w @devmentor/ui`). Interface language: English.
- Semantic tokens only (`npm run check:tokens`). Tokens: `packages/ui/src/tokens.css`; Tailwind mapping and panel theme: `packages/ui/src/styles.css`, imported as `@devmentor/ui/styles.css` by every panel root layout.

## Panel layer (`packages/ui/src/backend/`, exported from `@devmentor/ui`)

- `api/apiCall.ts` (`apiCall`/`apiCallOrThrow`) — the only sanctioned `fetch()` to `/api/*`.
- `forms/CrudForm.tsx` — schema-driven form, every create/edit form.
- `tables/DataTable.tsx` — every list.
- `feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx` — the only loading/error/empty renderers.
- `api/types.ts` mirrors the API envelope and CSRF header of `packages/core/src/http/envelope.ts`; keep both in sync.

## Where a new component goes (one home each)

1. shadcn primitive → `packages/ui/src/components/ui/` via `npx shadcn@latest add <name>` (run in `packages/ui`), never hand-written.
2. Generic, concept-agnostic panel pattern → `packages/ui/src/backend/<category>/`.
3. Component tied to one concept's domain shape → `packages/ui/src/components/<concept>/`.
4. Used by exactly one page → colocate it in that page's folder under `packages/app/src/app/` until a second consumer appears.

## Reference implementations

- `CrudForm` form: `packages/app/src/app/(auth)/sign-in/SignInForm.tsx`.
- `apiCall` → `DataTable` with its loading/error/empty states: `packages/app/src/app/(admin)/admin/HealthPanel.tsx`.
