# Security review — installed agent skills (lesson 09, scope item 6)

Date: 2026-11-15 · Spec: `.ai/specs/implemented/2026-11-15-agent-workshop-hardening.md` (scope item 6) · Mode: read-only audit, nothing executed from skill content, nothing committed.

## Summary

| Source | Skills | Read | keep | keep with note | needs owner decision | remove |
|---|---|---|---|---|---|---|
| Repo `.agents/skills/` (`om-*` from open-mercato/skills, `grill-me`/`grilling` from mattpocock/skills) | 60 | 60 SKILL.md + 8 scripts | 32 | 24 | 4 | 0 |
| Global `~/.claude/skills/qodo-*` | 7 | 7 | 0 | 7 | (dedupe, see F8) | 0 |
| Global org-synced `~/.claude/skills/synced/*` (`anthropic-skills:*`) | 22 | 22 (audyt-prospekta partly grep-only) | 10 | 11 | 1 | 0 (1 recommended, F1) |
| Plugin superpowers 7.0.2 (user) + 6.3.0 (project scope `/home/lukasz`) | 15 | 15 + all scripts + hook | 10 | 5 | 0 | 0 |
| Plugin qodo 2.3.1 (synced) | 5 | 5 | 0 | 5 | (dedupe, F8) | 0 |
| Plugin engineering 1.2.0 (synced) | 10 | 10 | 9 | 1 | 0 | 0 |
| Plugin gitkraken 1.0.0 (synced, MCP only) | 0 | plugin.json + mcp.json | — | — | 1 | — |
| **Total** | **119 skills + 1 MCP plugin** | | **61** | **53** | **6** | **0** |

- **Dynamic context (`` !`cmd` ``): none anywhere.** The only `!` + backtick-looking hits are spreadsheet formula text (`#VALUE!`, Sheets syntax in `google-workspace/references/sheets.md:57,290`).
- **Scripts shipped:** repo — `om-share-this-session/scripts/*.mjs` (2), `om-gap-analysis/bin/*` (5, not under `scripts/`), `om-pipeline-retro/references/classify-runs.sh` (1, hidden in `references/`). None reads `~/.ssh`, `~/.aws` or `.env`; none uses `curl`/`wget`. Network only via `git clone/fetch` in `gap-orientation-preflight`.
- **Hooks that run outside the model:** only the superpowers `SessionStart` hook (both installed versions). Marketplace catalog plugins with hooks (claude-security, code-modernization telemetry, hookify, ralph-loop, security-guidance, output-style ×2, theme-examples) are **not installed/enabled** — listed, not active. No hooks in repo `.claude/` or `~/.claude/settings.json`; no synced plugin ships hooks.
- **No real prompt-injection text** found (no exfiltration, no "hide this", no instruction to ignore the user). The "ignore previous instructions" hits (58× `references/agentic-setup.md:16`) are quoted examples of what to refuse. The real instruction-override signals are policy conflicts (F4, F7), not malicious text.

## Notable findings (ranked)

**F1 — Plaintext GitLab deploy token in an org-synced global skill (high, not DevMentor-specific).**
`~/.claude/skills/synced/<org>/wlc-brand-context/SKILL.md:18` clones `gitlab.wlc.team/pz/wlc-brand-context` with `claude_skill:<token>@` in the URL; the token also sits in `references/token.md:3-4`. It is synced to every org machine and lands in any transcript that loads the skill. Additionally `SKILL.md:25-27` tells the agent to follow the remote repo's index file — anyone who can push there can inject instructions into every content task. Action (owner): rotate the token, move it to a secret store/credential helper, pin the remote content. Value deliberately not reproduced here.

**F2 — `om-auto-review-pr` runs untrusted PR code locally (high).**
`om-auto-review-pr/SKILL.md:34` (worktree at `pull/{n}/head`, **checkout-pr** for forks) + `references/worktree-setup.md:31` ("install dependencies with whatever the repository's lockfile implies") + `SKILL.md:40` (full `validation.commands`: lint, build, tests, integration). This runs even without `--autofix`, so an external contributor's `postinstall`/test code executes with the user's home dir, `.env`, `gh` token. Chained from `om-auto-qa-pr`, `om-auto-fix-pr`, `om-review-prs`, `om-pr-autopilot`. Owner decision: restrict to own/trusted-author PRs, or skip install+validation on fork PRs.

**F3 — `om-auto-fix-pr` / fork flow push to and close other authors' PRs (medium-high).**
`om-auto-fix-pr/SKILL.md:53-55` applies autofix "whoever authored it"; `om-auto-review-pr/references/fork-pr-flow.md:11-17` opens a replacement PR and closes the original. Untrusted CI logs and PR text drive the fixes. Owner decision.

**F4 — Shared "no user in the loop" rule conflicts with the user's "ask before acting" (medium, all `om-*` with rules.md).**
42 copies of `references/rules.md:5`: "Autonomous run — no user in the loop. When a decision is needed, make the recommended, most-reversible call yourself … instead of stopping to ask." Same stance in `om-pr-autopilot/SKILL.md:26-27` ("The default is autonomous execution"), `om-auto-continue-pr/SKILL.md:17` + `references/adopt-pr.md:33` (`--adopt auto` rebuilds a goal from someone else's PR and implements it "without asking"), and superpowers `subagent-driven-development/SKILL.md:20-31`. Directly contradicts `~/projects/CLAUDE.md` ("Pytaj o pozwolenie przed wykonaniem akcji"). Not malicious, but it is the main instruction-precedence risk. Fix without editing installed skills: a repo-local `.ai/skills/<name>/SKILL.md` extension, or an AGENTS.md line stating that user instructions win.

**F5 — Screenshot/evidence egress to a public branch (medium).**
`.ai/trackers/github.md:279-319` (**attach-image-evidence**) base64-uploads images to a `qa-evidence-*` branch and links raw URLs; uses the fixed path `/tmp/ev-content.b64` (`:302-304`). Used by `om-auto-qa-pr`, `om-ux-review-pr`, `om-prepare-issue`. Anything visible in the running app (seed data, emails) becomes public if the repo is public.

**F6 — Self-modifying / persistent execution paths (medium).**
`om-prepare-test-env/SKILL.md:100-103,197-206` runs `.ai/scripts/test-env-up.sh` on every run without review and appends working commands to its own repo-local override `.ai/skills/om-prepare-test-env/SKILL.md` — a branch that edits the script gets executed by QA runs. `.ai/browsers/agent-browser.md:96-97` runs `sudo -n agent-browser install --with-deps` whenever passwordless sudo exists (`:26` "never delegates commands to the operator"); the binary itself is SHA-256 pinned (good). Every skill also auto-loads `.ai/skills/<name>/SKILL.md` if present (directory does not exist today) — a write there is an instruction-injection point.

**F7 — Superpowers SessionStart hook injects must-obey framing every session (medium-low).**
`superpowers/7.0.2/hooks/session-start:128` wraps `skills/using-superpowers/SKILL.md` in `<EXTREMELY_IMPORTANT>` and injects it on startup/clear/compact; the skill says "YOU DO NOT HAVE A CHOICE. YOU MUST USE IT." (`:13`) and "BEFORE any response … including clarifying questions" (`:20`). Softened by `:65` (user/CLAUDE.md instructions take precedence). Script itself is local-only (reads one file, prints JSON). Two versions are installed (user 7.0.2 + project-scoped 6.3.0) — clean up. Also: brainstorming companion `scripts/server.cjs:106-112,244-249` loads a remote logo with `?v=<version>` (version beacon) unless `DISABLE_TELEMETRY`/`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set; `--host 0.0.0.0` is documented (`visual-companion.md:95-101`).

**F8 — Third-party code egress via Qodo, auto-triggered (medium-low).**
`~/.claude/skills/qodo-review/SKILL.md:17` "`qodo review` sends your diff, new/untracked files and coding-session context to Qodo"; its description asks for "light background checkpoints while coding", so it can trigger without an explicit request. Gitignored/secret files are filtered (`:287`). `.qodo/` (recommended at `:138-140` for session context) is **not** in `.gitignore`, and `om-open-pr/SKILL.md:63` does `git add -A`. `qodo-codebase-wisdom/SKILL.md:53` pushes remote lookups "even when the repositories are available locally" and `:177,190` / `qodo-get-rules:190` ask the agent to credit Qodo in user-facing output (vendor steering). Installer is checksum-pinned (`qodo-setup/references/runtime.md:141-160`) — good. Two divergent copies with the same names (7 in `~/.claude/skills/qodo-*`, 5 in the synced qodo plugin) — keep one.

**F9 — Unpinned remote code at start-up / run time (medium-low).**
gitkraken plugin `mcp.json`: `npx -y @gitkraken/gk mcp` — no version pin, latest npm release runs on every session with git push/PR write access. `om-ux-setup/SKILL.md:72` `npx uxproof@0.3.1` — version pinned (and the skill explains why), but no integrity hash, dependencies unpinned.

**F10 — Smaller notes.**
- `om-open-pr/SKILL.md:63` `git add -A` before commit+push: anything not ignored (scratch output, `.qodo/`) is pushed. `.env*` is ignored (`.gitignore:34`).
- `om-integration-tests/SKILL.md:18` and `om-auto-qa-pr/references/boot-env.md:25-30` `set -a; . "$CREDENTIALS_FILE"` — sources an env file as shell code (kept out of context, which is good).
- `.ai/trackers/github.md:7-17` (local, intentional override for the personal-account setup): `GH_TOKEN=$(gh auth token -u "$REPO_OWNER" || gh auth token)` falls back to the active (work) account token when the owner has none — consider failing closed.
- `om-gap-analysis/bin/gap-orientation-preflight` clones/fetches/fast-forwards platform repos; an explicit `GAP_PLATFORM_CHECKOUT` outside the repo gets `fetch` + `merge --ff-only` (only if clean and on the branch). `--clone-url` scheme is not validated. Inputs are otherwise strictly validated; cache confined to `.ai/tmp/`.
- `om-share-this-session` publishes a sanitized session to a **public** repo. Opt-in (`sessionShare.enabled` must be `true`; absent in `.ai/agentic.config.json` → skill stops), exact-consent gate, strong local sanitizer (`scripts/prepare-share-bundle.mjs:31-183`, no network). `export-codex-session.mjs` spawns local `codex app-server` only. Keep disabled.
- Org-synced `oferta-wlc/references/wzorce/*` and `SKILL.md:116` carry confidential client offers and the CEO's contact data to every machine; `skill-creator/eval-viewer/generate_review.py:408-418` kills whatever holds its port; engineering `incident-response/SKILL.md:146-152` pages on-call/posts to chat when connected.

## Table

Legend — Scripts: `—` none. Dyn ctx: none found anywhere (column kept for completeness). Outbound: P=push, PR=open/update PR, C=comment, L=labels, M=merge, I=issue create/close, N=other network. Trifecta: D=private data, U=untrusted content, O=outbound. All repo `om-*` share `references/agentic-setup.md` (untrusted-content boundary — positive), `references/rules.md:5` (F4) and route tracker writes through `.ai/trackers/github.md`.

### Repo `.agents/skills/` (all read)

| Skill | Scripts | Dyn | Outbound | Injection / override signals | Trifecta | Verdict |
|---|---|---|---|---|---|---|
| grill-me | — | no | — | — | — | keep |
| grilling | — | no | — | — | — | keep |
| om-app-spec-writing | — | no | — (prints `npx skills add` hint only) | rules.md:5 | D U | keep |
| om-apply-upgrade-notes | — | no | N (fetches remote UPGRADE_NOTES.md, SKILL.md:42-45) | remote file steers local config edits | U | keep with note (`--dry-run` first) |
| om-approve-merge-pr | — | no | M, I, L, review | QA-gate enforced | D U O | keep with note (only on explicit "merge") |
| om-auto-continue-pr | — | no | P, PR, C, L | `--adopt auto` "without asking" (adopt-pr.md:33); `--force` claim takeover | D U O | keep with note (`--adopt ask`) |
| om-auto-continue-pr-loop | — | no | P, PR, C, L | rules.md:5, `--force` | D U O | keep with note |
| om-auto-create-pr | — | no | P, PR, C, L, N (`--skill-url`, operator URLs only) | rules.md:5 | D U O | keep with note |
| om-auto-create-pr-loop | — | no | as above | rules.md:5 | D U O | keep with note |
| om-auto-fix-issue | — | no | I, P, PR, C, L | issue text → pushed code, autonomous by default | D U O | keep with note |
| om-auto-fix-pr | — | no | P (others' branches), PR, I, L, closes PRs | F3 | D U O | **needs owner decision** |
| om-auto-implement-spec | — | no | P, PR, L | via engines | D U O | keep with note |
| om-auto-manage-issues | — | no | issue edits, C, L | implementation-prep.md:6 "never stops to ask" | D U O | keep with note |
| om-auto-qa-pr | — | no | C + image upload (F5), L | sources creds file (F10); `--self-qa-signoff` | D U O | keep with note (no self-signoff) |
| om-auto-qa-scenarios | — | no | docs PR | — | U O | keep |
| om-auto-review-pr | — | no | review, C, L, P (autofix), closes fork PRs | F2: installs + runs PR code; "fix … without asking" | D U O | **needs owner decision** |
| om-auto-sec-report | — | no | optional docs PR (default local) | — | D U (O) | keep |
| om-auto-sec-report-pr | — | no | optional docs PR | — | D U (O) | keep |
| om-auto-update-changelog | — | no | docs PR | — | U O | keep |
| om-auto-write-spec | — | no | P, PR, C, L, images | autonomous defaults, marked ⚠ | D U O | keep with note |
| om-backlog | — | no | I, C (after user sees tree, SKILL.md:11) | — | U O | keep |
| om-brainstorm | — | no | — | — | U | keep |
| om-check-and-commit | — | no | commit, P (only on explicit ask, SKILL.md:27) | no `--no-verify`/force (:32,:34) | U O | keep with note |
| om-close-fixed-issues | — | no | I close, C, L; cron-oriented (SKILL.md:88) | — | U O | keep with note (`--dry-run`) |
| om-code-review | — | no | — (callers post) | — | U | keep |
| om-create-agents-md | — | no | — | — | U | keep |
| om-create-skill | — | no | — | — | — | keep |
| om-discover | — | no | — | — | D U | keep |
| om-eject-and-customize | — | no | runs dependency "eject recipe" after approval (SKILL.md:23,115) | — | U | keep with note |
| om-evolve-harness | — | no | — | — | D U | keep |
| om-figma-design-with-ds | — | no | Figma writes only with `--apply` + confirm (:108) | — | U O | keep |
| om-fix | — | no | claim C, L, assign | rules.md:5 | U O | keep |
| om-followup-issue-from-pr | — | no | I (target repo from pasted URL, :22), C, L | — | U O | keep with note |
| om-framework-context | — | no | N only with explicit yes (:104) | — | U | keep |
| om-gap-analysis | 5 bash gates in `bin/` (local text checks; preflight clones/fetches) | no | N (git clone/fetch) | — | D U O | keep with note (F10) |
| om-help | — | no | — | — | — | keep |
| om-integration-tests | — | no | — | sources creds file (:18) | D U | keep with note |
| om-judge-agent-session | — | no | — | — | D U | keep |
| om-merge-buddy | — | no | — ("Never merge anything", :48) | — | U | keep |
| om-mockup-prototype | — | no | — | — | U | keep |
| om-open-pr | — | no | `git add -A`, P, PR, C, L | F10 | D U O | keep with note |
| om-pipeline-retro | `references/classify-runs.sh` (jq over stdin, no I/O) | no | — | — | U | keep |
| om-pr-autopilot | — | no | chains review/fix/QA; M only with `--allow-merge` | "default is autonomous" (:27); `--force` | D U O | keep with note |
| om-pre-implement-spec | — | no | — | — | U | keep |
| om-prepare-issue | — | no | I, C, L, image upload (:69) | — | U O | keep with note |
| om-prepare-test-env | — (generates `.ai/scripts/test-env-up.sh`) | no | sudo browser install via provider | F6 self-modifying script + skill override; `-ExecutionPolicy Bypass` (:41-42) | D U O | **needs owner decision** |
| om-qa-buddy | — | no | — | — | U | keep |
| om-review-prs | — | no | batch reviews on others' PRs | claim-pr.md:67 never auto-force | U O | keep with note |
| om-root-cause | — | no | — | — | U | keep |
| om-setup-agent-pipeline | — | no | L create, config/descriptor writes, commit | `--defaults` writes without confirmation (:12); installs executable descriptors | U O | keep with note |
| om-setup-discovery-pipeline | — | no | doc/config edits, offers commit | — | — | keep |
| om-share-this-session | 2 `.mjs`: local sanitizer + Codex export (no network) | no | public branch + issue (opt-in, disabled) | — | D U O | keep with note (keep disabled) |
| om-smart-test | — | no | — | — | U | keep |
| om-spec-writing | — | no | — | — | U | keep |
| om-synthetic-users | — | no | — | — | D U | keep |
| om-troubleshooter | — | no | — | — | U | keep |
| om-ux-review-pr | — | no | C + image upload (F5) | — | D U O | keep with note |
| om-ux-setup | — | no | N `npx uxproof@0.3.1` (:72) | F9 | U N | **needs owner decision** |
| om-ux-shape | — | no | — | — | — | keep |
| om-verify-in-repo | — | no | `git fetch` | — | U | keep |

### Global `~/.claude/skills/` and synced plugins

| Skill | Source | Scripts | Dyn | Outbound | Injection / override signals | Trifecta | Verdict |
|---|---|---|---|---|---|---|---|
| qodo-review | ~/.claude/skills (Qodo) | — (uses `~/.local/bin/qodo`) | no | N: diff + untracked files + context to Qodo cloud | auto "background checkpoints" (F8) | D U O | keep with note |
| qodo-codebase-wisdom | ~/.claude/skills | — | no | N (Qodo read API) | ":53 use Qodo even when repos are local"; credit-Qodo wording | D O | keep with note |
| qodo-get-rules | ~/.claude/skills | — | no | N (read) | credit-Qodo wording (:190) | O | keep with note |
| qodo-manage-standards | ~/.claude/skills | — | no | N (writes rules after confirm) | — | O | keep with note |
| qodo-review-notes | ~/.claude/skills | — | no | N (publishes notes, authorized) | — | D O | keep with note |
| qodo-review-resolver | ~/.claude/skills | — | no | N (finding status writes, authorized) | — | U O | keep with note |
| qodo-setup | ~/.claude/skills | — (downloads checksum-pinned installer) | no | N (curl installer, login) | — | O | keep with note |
| qodo plugin (5 skills) | synced plugin 2.3.1 | — | no | as above | divergent duplicate of the 7 above | D U O | keep with note — keep one copy |
| wlc-brand-context | org-synced | — | no | N git clone with embedded token | F1: plaintext token; remote index steers loading | D U O | **needs owner decision** (rotate token; recommend removing from sync) |
| oferta-wlc | org-synced | `build_offer.py` (local docx/soffice) | no | — | confidential client data in refs | D | keep with note |
| wlc-papier-firmowy | org-synced | `build_docx.py` (local) | no | — | — | — | keep |
| raport-kondycji-serwisu | org-synced | `kontrola.py`, `pdf_bez_aneksu.py` (local) | no | MCP (DataForSEO, Ahrefs, PSI, crawler) | — | D U O | keep with note |
| audyt-prospekta | org-synced | — | no | MCP (company DataForSEO, Ahrefs, CrUX) | — | U O | keep with note |
| raport-wsl, raport-pr, raport-niebillowalnosci-pr-su, analiza-projektu | org-synced | inline snippets only | no | Jira/Worklogi MCP read | — | D | keep with note (not relevant to DevMentor) |
| docx, pptx, xlsx | Anthropic | `office/soffice.py` + helpers (local; LibreOffice) | no | `npm install` fallback hint | — | — | keep |
| pdf | Anthropic | local form/render scripts | no | `pip install` hint | — | — | keep |
| google-workspace | Anthropic | local request builders | no | Google connectors (writes, revision-checked) | — | D O | keep |
| skill-creator | Anthropic | spawns nested `claude -p`; local review server | no | local only (+ Google Fonts in report) | — | — | keep with note |
| chrome-browser, built-in-browser, computer-use | Anthropic | — | no | browser/desktop control | defensive text | D U O | keep with note |
| morning, deep-research, import-memory, docs | Anthropic | — | no | connectors / web / memory | defensive text | D U O | keep |
| superpowers: using-superpowers (+ SessionStart hook) | plugin 7.0.2 / 6.3.0 | hook: `run-hook.cmd` → `session-start` (reads one file, prints JSON) | no | — | F7 must-obey framing every session | — | keep with note |
| superpowers: brainstorming | plugin | local Node HTTP/WS server (127.0.0.1) | no | N remote logo beacon | "MUST use before any creative work" | O | keep with note (set DISABLE_TELEMETRY; specs go to `.ai/specs/` per CLAUDE.md) |
| superpowers: diagnosing-superpowers | plugin | — | no | gh issue on obra/superpowers after approval | — | D U O | keep with note |
| superpowers: subagent-driven-development | plugin | `task-brief`, `review-package`, `sdd-workspace`, `sdd-repo` (local) | no | — | "keep going" without asking (:20-31) | — | keep with note |
| superpowers: using-git-worktrees | plugin | — | no | auto `npm install`, commits .gitignore | — | U | keep with note |
| superpowers: executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, dispatching-parallel-agents, systematic-debugging, test-driven-development, verification-before-completion, writing-plans, writing-skills | plugin | `task-start`/`task-done`, `find-polluter.sh`, `render-graphs.js` (all local) | no | push/PR only after menu choice; gh replies | "Iron Law" process wording only | — | keep |
| engineering (10 skills) | synced plugin 1.2.0 | — | no | `.mcp.json`: Slack, Linear, Asana, Atlassian, Notion, GitHub, PagerDuty, Datadog | incident-response:146-152 pages on-call | D U O | keep (incident-response: keep with note) |
| gitkraken | synced plugin 1.0.0 (MCP only) | `npx -y @gitkraken/gk` unpinned | — | git push/PR write via MCP | — | D O | **needs owner decision** (pin or drop; overlaps gh + om-*) |

## Grep pattern used

The course pattern `'!`|curl |wget |base64 |~/\.ssh|~/\.aws|\.env'` matches spreadsheet `#VALUE!` and every `.env` mention. Improved triage (ERE; real dynamic context only when `!` + backtick starts a line or follows whitespace):

```bash
P='(^|[[:space:]])!`[^`]+`|\bcurl\b|\bwget\b|base64|~/\.ssh|~/\.aws|\$HOME/\.(ssh|aws)|id_rsa|\.env\b|GH_TOKEN|GITHUB_TOKEN|API_KEY|SECRET|glpat-|https?://[^ /]+:[^ @]+@|\beval\b|\bnc\b|npx |npm (i|install) |pip install|ignore (all |any )?(previous|prior)|do not (tell|inform|mention|ask)|without (asking|telling|confirmation)|silently|--no-verify|--force|dangerously|bypassPermissions|skip-permissions'
grep -rnEI "$P" <skill-dirs>
# plus: find <skill-dirs> -type f \( -perm -u+x -o -name '*.sh' -o -name '*.mjs' -o -name '*.js' -o -name '*.py' \)
#       (catches scripts outside scripts/, e.g. om-gap-analysis/bin/, om-pipeline-retro/references/classify-runs.sh)
# plus: find ~/.claude/plugins -name hooks.json  and  jq '.enabledPlugins' ~/.claude/settings.json  (installed vs catalog-only)
```

Shared reference files were deduplicated by md5 (419 unique files of 493) before reading hit context.
