# Code review

The review rules for this repository live in one place: the engineering standards spec, §1 (security minimums and review checklist) — [`.ai/specs/2026-09-01-engineering-standards.md`](.ai/specs/2026-09-01-engineering-standards.md). `AGENTS.md` is the short version. This file only adds what a reviewer must check on top of them.

- **Gate:** every command in `.ai/agentic.config.json` `validation.commands` passes; coverage stays at 100% with no new exclusions.
- **Contracts:** any change to a surface in [`BACKWARD_COMPATIBILITY.md`](BACKWARD_COMPATIBILITY.md) follows its required path.
- **`.ai/` workflow:** a non-trivial change links its spec in `.ai/specs/`; an implemented spec is `Status: implemented` and moved to `.ai/specs/implemented/`; a fixed bug or discovered gotcha has a lesson in `.ai/lessons.md`.
- **Severity:** blocker — security minimum, failing gate, broken contract, data loss; major — missing test for changed behaviour, layer or DI rule broken; minor — naming, readability.
