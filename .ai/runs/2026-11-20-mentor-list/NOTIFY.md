# Notify — 2026-11-20-mentor-list

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-20T11:30:49Z — run started
- Brief: implement .ai/specs/2026-10-21-mentor-list.md (E02-S01, #27, epic #17) with om-auto-create-pr-loop; #28 follows as a PR stacked on this branch.
- Decision: /mentors stays in the (mentee) group and becomes public (see PLAN deviations).
- Decision: bookableSummaryFor groups one find result in the service (no raw SQL from core).

## 2026-11-20T11:36:58Z — checkpoint 1 (Phase 1)
- Lint, typecheck, unit 100% (1630), build green. Decision: a repeated ?tag= is read with getAll so the schema refuses it (parseSearchParams would keep one value).
