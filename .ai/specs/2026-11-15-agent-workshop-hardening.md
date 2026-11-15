# Agent workshop hardening (lesson 09)

Status: in-progress
Source: course lesson 09 "Security of AI tools" (local copy `C:\AI techleaders\Lekcja 9`, lab `lekcja-09-laboratorium`) · Branch: `chore/lesson-09-workshop-hardening`

## Goal
Before agents start working autonomously on DevMentor (lesson 10+), make sure no agent run in this repository holds all three legs of the lethal trifecta (private data, untrusted content, outbound communication) without a guard outside the model. The guard must live in the repository, so it applies to every agent session, reviewed like code.

## Scope
1. **Permission deny rules** (`.claude/settings.json`, committed): the Read/Edit/Write tools may not read secret files — `.env`, `.env.*` (except `.env.example`), `*.pem`, `~/.ssh/**`, `~/.aws/**`, `~/.config/gh/**`, `~/.qodo/auth.key`, `~/.claude/projects/**` (session history).
2. **Sandbox for Bash** (same file): `sandbox.enabled: true`, `allowUnsandboxedCommands: false`, `filesystem.denyRead` for the same credential locations, `network.allowedDomains` limited to what the workshop really uses, `deniedDomains` for cloud metadata endpoints. The allowlist is derived from tested workflows, not guessed (see Requirements).
3. **Deterministic guardrail**: `.claude/hooks/pre-tool-use.sh` on `PreToolUse` for `Bash` (exit 2 blocks, message to the model): pipe-to-shell (`curl|wget … | sh`), recursive delete outside build artefacts, access to credential paths, reading `.env` by any command name. Executable bit committed; unit-tested without an agent (bats-free: a small `node:test`/Vitest script feeding JSON on stdin), including the bypasses we know about.
4. **CODEOWNERS**: `.claude/`, `.agents/`, `.mcp.json`, `.codex/`, `CLAUDE.md`, `AGENTS.md`, `packages/app/AGENTS.md`, `.github/workflows/`, `.github/CODEOWNERS`, `skills-lock.json` → `@LukaszLasota`.
5. **Workshop audit** in `.ai/security-notes.md` (lesson's `security-notes.md`, kept in `.ai/` per AGENTS.md): agent-config audit of DevMentor and two cloned repos, list of skills / MCP servers / permissions with a read-through verdict per skill, session scan counts (no values), sandbox and hook test results incl. bypass attempts, own prompt-injection test, and the trifecta sentence.
6. **Skill read-through**: every installed skill not written by us (`.agents/skills/om-*`, global `~/.claude/skills`, plugin skills) is read for dynamic context, outbound calls, credential access and injected instructions; verdict per skill in the notes. The course grep is replaced by a pattern without the `#VALUE!` false positives.
7. **Own prompt-injection test**: a trap sentence in a fixture the agent reads in a normal task (e.g. a fake issue body / build log under `.ai/security-fixtures/`), run in a fresh agent session; result recorded.
8. **Lessons + AGENTS.md**: one rule in AGENTS.md ("agent config is code: changes go through CODEOWNERS review; never read `.env`; the hook and sandbox are part of the quality gates").

## Out of scope
- Secret manager instead of `.env` (1Password/Doppler/Infisical): postponed by the session owner on 2026-11-15; `.env` stays, protected by deny rules and the sandbox.
- Snyk Agent Scan (needs a Snyk account and token) — optional; the grep + read-through replaces it here.
- Product security (lesson 16).
- Running the lab demos 01–05 in Claude Code / Codex: done by the session owner by hand if wanted; results go into the notes.

## Requirements
- R1 The settings file and hook are committed and apply to every Claude Code session in the repo; `.claude/settings.local.json` stays personal (already ignored globally).
- R2 The sandbox must not break the workshop. Before committing, each of these is run inside a sandboxed agent session and the result recorded: `npm run validate`, `npm run test:integration` (Docker socket + testcontainers + agent-browser Chromium), `npm run dev` + a request to `localhost`, `gh pr view` with `GH_TOKEN`, `git push` over SSH, `qodo review --help` / `qodo read whoami`, `npm install` of a package. Each needed domain or path is added deliberately; anything that cannot work sandboxed is listed under "excluded commands" with a reason (the deny rules and hook still apply there).
- R3 Negative tests, recorded: `curl https://example.com` blocked, `git clone` from a non-allowlisted host blocked, `cat ~/.ssh/config` blocked, Read tool on `.env` refused, `python -c` / `node -e` / `awk` reading `.env` blocked by the sandbox `denyRead` even where the hook pattern misses.
- R4 Hook: blocks with exit 2 and a reason; passes everything else with 0; never exits 1 by accident (missing `jq` → fail closed with 2 and a message); tests cover pipe-to-shell, `rm -rf` of the repo/home, credential paths, `.env` reads incl. `.env.example` allowed.
- R5 No secret value is printed into the session, the notes, commits or the PR (counts and masked hosts only).
- R6 `npm run validate` green; the hook tests are part of it.

## Acceptance criteria
- `.claude/settings.json` with `permissions.deny`, `sandbox` and the `PreToolUse` hook, merged to `main`.
- A fresh agent session cannot read `.env` with Read, `cat`, `node`, `python` or `awk`; cannot reach a non-allowlisted domain; can run validate, integration tests, dev server, `gh`, `git push`.
- Hook tests pass and document the known gaps.
- `.github/CODEOWNERS` covers the agent-config paths; the PR notes that "Require review from Code Owners" on a solo repo blocks self-merge, so it stays off until there is a second maintainer (decision for the owner).
- `.ai/security-notes.md` filled per the lab template incl. the trifecta sentence.

## Decisions in play
- Sandbox on by default for this repo: may slow down some workflows; the allowlist is the price.
- Where the session owner's GitHub client secret was pasted into a chat (2026-11-14): rotate (owner action), noted in the security notes.

## Open questions
- None blocking. Branch protection with code-owner review: owner decides after reading the PR note.

## Implementation notes (scope 1–4, 8)
- **Dotenv deny list is explicit, not `.env.*`.** In Claude Code, deny beats allow (`deny → ask → allow`, first match wins), so `allow: Read(./.env.example)` cannot carve it out of `Read(./.env.*)`. A `Read(!.env.example)` negation exists, but how it reaches the sandbox `denyRead` (Read deny rules are copied there) is undocumented; a miss would hide `.env.example` from `npm run setup`. So the rules name `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test`, `.envrc` (bare names match at any depth under the cwd). A dotenv file with another name (`.env.bak`) is not covered by Read deny or the sandbox; the hook still blocks any mention of it.
- **`Write(...)` rules are not used**: Claude Code does not match them; `Edit(...)` deny covers Edit/Write/NotebookEdit and becomes sandbox `denyWrite`. Edit rules use literal paths only (Linux `denyWrite` supports no wildcard other than a trailing `/**`).
- **Session history**: `Read(~/.claude/projects/**/*.jsonl)` (transcripts) instead of `/**`, so the Read tool still reaches auto-memory (`memory/`) and the session's `tool-results/`; the sandbox `denyRead` covers the whole `~/.claude/projects` for Bash.
- **Qodo**: only `~/.qodo/auth.key` is in `denyRead`. Denying the whole `~/.qodo` hid the CLI binary (`~/.local/bin/qodo` is a symlink into `~/.qodo/bin/`), so `qodo` was "command not found" in the sandbox. Commands that need the key (`qodo review`, `qodo read whoami`) are R2 items.
- **`failIfUnavailable: true`**: without it Claude Code silently runs commands unsandboxed when bubblewrap/socat are missing.
- **`excludedCommands`** (run outside the sandbox, still under deny rules and the hook), forced by Linux/WSL2 sandbox limits per the sandboxing docs: `docker compose *` (Docker socket; on Linux Unix sockets open only all-or-nothing), `npm run test:integration` (Docker socket for testcontainers; Chromium needs user namespaces), `npm run dev` (a sandboxed command's localhost is private: no host Postgres, no browser from the host), `git push` / `git push *` (SSH ignores the HTTP proxy). Risk: the agent can edit what these run (package.json scripts, next.config.ts, git hooks) and then run it unsandboxed; R2 decides whether to add `ask` rules for them.
- **Allowed domains**: `github.com`, `api.github.com`, `codeload.github.com` (git over HTTPS, `gh`, npm git dependencies); `objects.githubusercontent.com`, `release-assets.githubusercontent.com` (GitHub release downloads, e.g. agent-browser's postinstall fallback); `registry.npmjs.org` (`npm install`, `npm audit`); `sdk.qodo.ai`, `get.qodo.ai` (Qodo CLI). Left out on purpose: Docker Hub (images are pulled by the Docker daemon, outside the sandbox), Chrome for Testing (`googlechromelabs.github.io`, `storage.googleapis.com` — a shared bucket host is an exfiltration channel; `agent-browser install` is a one-off owner action), Next telemetry. Denied: `169.254.169.254`, `[fd00:ec2::254]` (AWS IPv6 metadata), `metadata.google.internal`.
- **`gh`** runs in the sandbox; with `~/.config/gh` hidden it authenticates only through `GH_TOKEN`. Residual risk: `GH_TOKEN` reaches sandboxed commands and `github.com`/`api.github.com` are allowed, so a gist or issue is still an exfiltration path (credential masking needs `network.tlsTerminate`, user settings only).
- **Hook** (`.claude/hooks/pre-tool-use.sh`, tests `scripts/hooks/pre-tool-use.test.mjs`): fails closed on missing `jq` or bad input; reads stdin with the `read` builtin (`$(</dev/stdin)` fails on the socket stdin of Node's `spawnSync`). Known gaps are listed in the script header and pinned by tests. The hook also matches paths in the agent's own config edits done through Bash (heredocs naming credential paths): edit such files with the Edit tool.
