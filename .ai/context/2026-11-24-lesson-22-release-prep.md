# Lesson 22 — release 1.0 preparation

Prepared 2026-11-24; the release itself (pre-release branch, QA, tag, GitHub Release, restore test) is lesson 24. Drafts: `CHANGELOG.md` (1.0.0, unreleased) and `UPGRADE_NOTES.md` (deploy and rollback procedure).

## State on `main` (106e006)
- Open pull requests: 0. CI green on the last merges (#100, #101, #102); ruleset on `main` requires PRs and all CI jobs.
- Version in `package.json`: `0.1.0`; no tags or releases yet.
- 15 migrations, all additive, each with `down` (checked).
- Unit 2284, integration 216 (34 files), 100% coverage.

## Scope of 1.0
In: the brief's Now (1.0), E01–E04 with every story spec in `.ai/specs/implemented/` (backlog spec map), plus invitation batches (R13/D13, #100) and the lesson 16 security fixes.

Open issues, triaged for 1.0:

| Issue | Decision for 1.0 | Why |
|---|---|---|
| #98 price chips look like the length options | **in (candidate)** | priority-medium, user-facing, small; the same confusion #79 fixed |
| #78 mentor card: make the way to booking obvious | **in (candidate)** | priority-medium, the first step of the booking path |
| #74 integration suite rewrites the MikroORM snapshot | in if cheap, else 1.0.1 | developer-only, but it bit lesson 21 twice; no user impact |
| #99 screen-reader time in UTC | 1.0.1 | accessibility, low |
| #80 role notice names the account | 1.0.1 | low |
| #90 shared "page is public" predicate | later | refactor, no behaviour |
| #75 integration row helper, #81 faster suite, #76 payouts QA walk | later | developer tooling |
| #82, #83, #20 (E05) | out | Later (parked) by the brief; #83 decided after the D22 readout 2026-11-30 |

| #103 batch overview N+1, #104 duplicated batch size | 1.0.1 | lesson 21 review follow-ups; fine at 1.0 scale |
| #105 stale messages on `/admin/invitations` | 1.0.1 | operator-only, low |

## Release checklist (lesson 24)
1. Owner confirms the scope above (#98, #78 in or out).
2. Pre-release branch `release/1.0` from `main`; CI green; version `1.0.0` in `package.json`.
3. `CHANGELOG.md` final (date, any late PRs; `om-auto-update-changelog` can redo it from merged PRs) and `UPGRADE_NOTES.md` checked against the hosting (cyber_Folks, open T-13 headers).
4. QA on the pre-release: `om-auto-qa-scenarios` over the merged PRs, P0 routes by hand (sign-in, invite and accept, publish page/slot/prices, book and pay, cancel, text session, payout release).
5. Tag `v1.0.0`, GitHub Release with the changelog section.
6. Restore test: deploy the previous state from its tag on a scratch database (migrations `down` then `up`), check `/api/health` and one booking.
7. `om-close-fixed-issues` after the release.

## Owner decision needed
- #98 and #78 in 1.0 or after.
