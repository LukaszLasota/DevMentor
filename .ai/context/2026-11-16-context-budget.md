# Context budget: AS IS / TO BE (lesson 10 close-out)

**Measured:** 2026-11-16 · **Tool:** Context Scope (course tool, run from a local clone, not installed in the repo) · **Spec:** `.ai/specs/implemented/2026-11-16-agent-context-routing.md`

Compare numbers only within one tool: `/context` also counts the system prompt and built-in tools, so its totals are higher.

## AS IS / TO BE

| What | AS IS (before the router) | TO BE (main after #46) |
|---|---|---|
| Claude Code session start-up, instruction files + skill descriptions | 19.8k (`scan`, from sessions) | 13.8k (`check`, from disk) |
| Root `AGENTS.md` (Claude-calibrated) | 8,867 | 4,420 |
| `CLAUDE.md` with its imports | `AGENTS.md` + `packages/app/AGENTS.md` | `AGENTS.md` only (4,425) |
| Skill descriptions (remainder of start-up) | ≈ 9–10k | ≈ 9.4k, unchanged |
| Codex start-up | — | 8.4k |
| MCP servers configured in the repo (`.mcp.json`) | 1 | 1 |
| Context peak at session start | unknown | re-check with `scan` after a few new sessions |

`check` uses the tool's default budget of 6,000 tokens, so it still reports "over budget". The course reference project ends at 12.3k with the same shape: the instruction files shrank by about two thirds and the skill descriptions stayed. Two other `check` results are accepted on purpose:
- The 3,000-token single-file budget flags `AGENTS.md` at 4.4k. The course reference file ends at 3.9k, and our own `check:agents` line budget is the gate.
- S-06, "no `.claude/rules` scoping", fires as well. The nested `packages/*/CLAUDE.md` → `AGENTS.md` files already scope package rules by directory, and they also work for Codex.

Re-run it with:

```
node <context-scope>/packages/cli/src/contextscope.mjs check --repo .
```

## What loads always, what loads on demand

**Always, every session and every turn.** Anything in this tier is paid for every time, so it has to stay small:
- the system prompt and tool definitions, including MCP tool names;
- the user-level `~/.claude/CLAUDE.md` and any `CLAUDE.md` in a parent directory;
- the repo `CLAUDE.md`, which is `@AGENTS.md`;
- the auto-memory index;
- the name and description of every model-invocable skill.

**On demand, paid only when the agent reaches for it:**
- `packages/*/AGENTS.md`. Claude Code loads the nested `CLAUDE.md` when it reads files in that package.
- Every file named in the `AGENTS.md` task-routing table, including `.ai/README.md`, `.ai/lessons.md` and the specs.
- A skill's `SKILL.md` body, and its references, when the skill is invoked. Script code never enters the context, only the script's output.
- Code search results and subagent results. Subagents run in their own windows.

## Skills review

- `.agents/skills/` holds 60 skills (58 Open Mercato `om-*`, plus `grill-me` and `grilling`), with `.claude/skills/` symlinking to them. All are pinned in `skills-lock.json` and none is ours.
- Every description is at most 540 characters, well under the 1,024 limit, and states when to use the skill ("Use for …", "Use when …"). Following the course, we do not rewrite upstream descriptions: they are tested and would drift from the lock hashes.
- `grill-me` sets `disable-model-invocation: true`, so its description costs nothing. `grilling` is the model-invocable twin.
- The cost of 60 descriptions is accepted, because lesson 11 (autonomous coding) uses the `om-auto-*` chain.

## Outside the repo (owner's machine)

These are not in git. They are recorded here so the next measurement explains its numbers:

- **Stale skill copies.** `~/.claude/skills/qodo-{codebase-wisdom,review,review-notes,review-resolver,setup}` (2026-10-26) duplicate the org-synced `qodo` plugin, so the same skills are described twice in every session. Delete the local copies and keep the plugin.
- **Old plugin version.** `superpowers` 6.3.0 is still installed at project scope for `/home/lukasz`, next to the user-scope 7.0.2.
- **Leftover directory.** `~/.claude/plugins/cache/temp_git_*` is a leftover from a failed clone.
- **Unused claude.ai connectors.** Atlassian, Slack, Figma and others are not used in this project. Turn them off for DevMentor sessions in `/mcp`. Their tools are deferred, so only the names cost tokens.
- **Unrelated parent instructions.** `~/projects/CLAUDE.md` (Kinsta/DDEV/WordPress) loads here because the repo sits under `~/projects/` and is irrelevant to DevMentor. Move the repo out of `~/projects/` or accept the cost.

## Dead references fixed

Context Scope `check` (S-05) flagged two path-like references that did not exist:

- `AGENTS.md` named `.codex/`. That directory is owned in `CODEOWNERS` in advance but does not exist, so the line now points to `CODEOWNERS` for the full list.
- `packages/db/AGENTS.md` named the Node env object, which is not a path. It is reworded as "environment variables".
