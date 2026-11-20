# Notify — 2026-11-20-availability-slots

> Append-only log. Every entry is UTC-timestamped. Never rewrite prior entries.

## 2026-11-20T09:40:20Z — run started
- Brief: implement .ai/specs/2026-10-21-availability-slots.md (E01-S05, #25, epic #16) with om-auto-create-pr-loop regardless of step count; reuse docs/design-system.md and Storybook (SlotsPanel).
- External skill URLs: none
- Decision: work in the main checkout on feat/availability-slots (worktree creation is blocked by the sandbox, per the operator).
- Decision: Steps run inline (the main session already holds the #23 patterns this story extends); 4.1 dispatched to a cheap-tier executor as the course's "cheaper model for mechanical tasks" exercise.
- Decision: #24 is not merged, so mentorOfferReady = published + hasBookableSlot until #24 adds its price requirements (spec Architecture allows this).

## 2026-11-20T09:48:59Z — checkpoint 1 (steps 1.1..2.4)
- Lint, typecheck, unit tests at 100% and build green; integration skipped locally (no Docker, CI runs it).
- Decision: Tasks-table Commit cells resolved at checkpoints (self → SHA), since an amend would change the SHA it records.
- Decision: `publish` computes GREATEST(last, now) in the service on the row it holds locked (same semantics as SQL GREATEST, no raw SQL).
- Decision: owner DTO gains `offerReadiness` (for the /mentor slot step); public DTO gains `offerReady` + `slots` (empty unless offer-ready).
