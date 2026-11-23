# D25–D26 — decisions recorded from specs

- Recorded: 2026-11-23 (lesson 15 retro). Both decisions were made on 2026-11-20 by the session owner (Łukasz Lasota) while writing specs, but nobody copied them into the brief. Agents kept reading the old text: the brief said "no automatic refunds in 1.0" and "Q01 open", while the code refunded through Stripe and ran sessions in DevMentor.

## D25 — automatic refund on free cancellation

- Decision: a mentee who cancels 24 hours or more before the session is refunded automatically through the Stripe API. Disputes stay with the operator.
- Supersedes: the refund clause of D10 / R10 ("no automatic refunds in 1.0"). The rest of D10 stays.
- Source: `.ai/specs/implemented/2026-11-20-booking-cancellation.md` (Status line, Q1). Shipped in #58.

## D26 — the text session runs in DevMentor

- Decision: mentor and mentee hold the text session on a session screen in DevMentor, not in a channel the mentor names.
- Answers: Q01.
- Source: `.ai/specs/implemented/2026-11-20-text-session.md` (Status line). Shipped in #61.

## Rule going forward

When a spec answers an open question or overrides a brief rule, the same PR updates the brief: it closes the question, adds a decision row, and marks the superseded rule. Writing "we don't do this" in a new file is not enough; the old text has to change too.
