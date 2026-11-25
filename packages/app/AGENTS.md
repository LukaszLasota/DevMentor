<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## DevMentor app rules

The two blocks above are written by `next dev` (`node_modules/next/dist/server/lib/generate-agent-files.js` replaces only the text between their markers); never edit them. Everything below is ours. Paths are relative to the repo root.

### Routes and rendering

- HTTP/rendering only: business rules live in `core` services. Every route handler is wrapped in `apiHandler` (or `makeCrudRoute`) from `@devmentor/core/http` (exception: top-level browser redirects such as `api/auth/github` use `redirectHandler`) — no own `try/catch` or `NextResponse.json()`. A handler with more than one service call lives in `packages/core/src/http/<concept>.ts`; the route file only wires it.
- No `export const dynamic` (removed with `cacheComponents`) and no `use cache` around DB reads: uncached DB access runs at request time. The app must build and boot with no database reachable — check `npm run build` without a DB.
- The root `.env` is loaded by `packages/app/next.config.ts`.

### Route groups and pages

- `packages/app/src/app/(marketing)` — public pages, Tailwind only (no shadcn). `(auth)` (sign-in, register, verify email), `(admin)` and the persona groups `(mentee)` and `(mentor)` — panel surface, shadcn/ui via `@devmentor/ui`. A group is created with its first page; the mentee persona group is `(mentee)`, not `(student)`. Each group that needs its own `<html>` has its own root layout (`invitation/` too); there is no `src/app/layout.tsx`.
- Guarded pages: the layout and every `page.tsx` of a guarded group call `requirePageSession(path)` / `requirePageRole(path, ...roles)` (`packages/app/src/lib/session.ts`) inside `<Suspense>`; the session read lives in a colocated async component, not in `page.tsx` (Next allows only its own exports there). Role homes (`homeFor` from `@devmentor/core`) render `RoleNotice` with the `notice` search param.
- Signed-in shell: every signed-in root layout (`(mentee)`, `(mentor)`, `(admin)`) renders `AppShell` of `@devmentor/ui` with `header={<AccountHeader />}` and `nav={<AccountNav />}` (`packages/app/src/components/account/`), each inside `<Suspense>` — behind the layout guard where there is one; both render nothing without a session. The session is read on the server; only the current-item check runs in the client `ShellNav` (`usePathname`). Sidebar links go only to pages that exist — a new area page adds its item to `accountNavSections` (`packages/ui/src/components/auth/accountNav.ts`). Session reads are memoized per request, so guards, header and sidebar share one check.

### Integration tests

`packages/app/integration/` (`npm run test:integration`, needs Docker and the owner's approval) runs the production build against a throwaway PostgreSQL from testcontainers and drives pages with `agent-browser` (wrapper: `packages/app/integration/agent-browser.ts`).

### Reference implementations

- Route with `apiHandler`: `packages/app/src/app/api/health/route.ts` (one service call); `packages/app/src/app/api/invitations/[token]/accept/route.ts` (handler from `core`, session, cookies).
- Guarded page: `packages/app/src/app/(mentor)/layout.tsx` + `packages/app/src/app/(mentor)/MentorGuard.tsx`, `packages/app/src/app/(mentor)/mentor/page.tsx` + `packages/app/src/app/(mentor)/mentor/MentorContent.tsx`.
- `CrudForm` form and other panel-layer usage: `packages/ui/AGENTS.md` § Reference implementations.
- Integration test (HTTP + DB + browser): `packages/app/integration/invitation-flow.test.ts`.
