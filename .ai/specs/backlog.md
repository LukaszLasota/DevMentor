# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-21

Scope: the brief's Now (1.0) in E01–E04; Later parked in E05 (not filed as stories). Not doing: N01, N02.
Open before specific stories: none for 1.0 — Q01 was answered on 2026-11-20 (the session runs in DevMentor) and Q04 lapsed when Connect shipped (#65). Q10 (recording mentor-page visits) is not filed as a story. Not covered by any story yet: the home page and shared public shell, deploying 1.0, privacy and consent (lesson 15 retro, `.ai/context/2026-11-23-lesson-15-retro.md`).

Specs (updated 2026-11-23): E01-S01 → `implemented/2026-10-21-sign-in-github-and-email.md` + `implemented/2026-10-21-platform-primitives.md`; E01-S02 → `implemented/2026-10-21-mentor-invitations.md` (criterion 4 met by `npm run invite -- list`); E01-S03 → `implemented/2026-10-21-mentor-page.md`; E01-S04 → `implemented/2026-10-21-mentor-prices.md` (PLN within operator bounds); E01-S05 → `implemented/2026-10-21-availability-slots.md`; E01-S06 + E01-S07 → `implemented/2026-11-21-mentor-payouts.md` (supersedes `archive/2026-10-21-stripe-connect-payouts.md`); E02-S01 → `implemented/2026-10-21-mentor-list.md`; E02-S02 → `implemented/2026-10-21-mentor-share-link-page.md`; E03-S01 → `implemented/2026-11-20-booking-stripe-checkout.md`; E03-S02 → `implemented/2026-11-20-booking-cancellation.md`; E04-S01 → `implemented/2026-11-20-text-session.md`; E04-S02 → `implemented/2026-11-20-session-note.md`. Without a story (R13/D13, lesson 21, PR #100): invitation batches of 20 with the two-week check → `implemented/2026-11-24-invitation-batches.md` (extends E01-S02; capabilities in `capabilities/invitation-batches.md`, `capabilities/mentor-invitations.md`).

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | Mentor onboarding | — | — | no |
| E01-S01 | [#21](https://github.com/LukaszLasota/DevMentor/issues/21) | Anyone can sign in with GitHub, with email and password as fallback | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | — | no |
| E01-S02 | [#22](https://github.com/LukaszLasota/DevMentor/issues/22) | The operator can invite a mentor, and only invited people become mentors | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | E01-S01 (#21) | no |
| E01-S03 | [#23](https://github.com/LukaszLasota/DevMentor/issues/23) | A mentor can fill a page with public work and stack tags and gets a share link | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | E01-S02 (#22) | no |
| E01-S04 | [#24](https://github.com/LukaszLasota/DevMentor/issues/24) | A mentor can set 25- and 50-minute prices within operator bounds | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | E01-S03 (#23) | no |
| E01-S05 | [#25](https://github.com/LukaszLasota/DevMentor/issues/25) | A mentor can publish slots | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | E01-S03 (#23) | no |
| E01-S06 | [#26](https://github.com/LukaszLasota/DevMentor/issues/26) | A mentor can connect Stripe and receives each session's payment minus the 20% fee | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | E01-S02 (#22), E03-S01 (#29) | no |
| E01-S07 | [#35](https://github.com/LukaszLasota/DevMentor/issues/35) | DevMentor keeps 20% of a paid session and pays the mentor's share through Stripe Connect | [#16](https://github.com/LukaszLasota/DevMentor/issues/16) | E01-S06 (#26), #29 | no |
| E02 | [#17](https://github.com/LukaszLasota/DevMentor/issues/17) | Finding a mentor | — | — | no |
| E02-S01 | [#27](https://github.com/LukaszLasota/DevMentor/issues/27) | A mentee can browse mentors by stack tag, ordered by most recent availability | [#17](https://github.com/LukaszLasota/DevMentor/issues/17) | E01-S03 (#23), E01-S05 (#25) | no |
| E02-S02 | [#28](https://github.com/LukaszLasota/DevMentor/issues/28) | A mentee opening a share link sees the mentor's work, prices and slots | [#17](https://github.com/LukaszLasota/DevMentor/issues/17) | E01-S03 (#23) | no |
| E03 | [#18](https://github.com/LukaszLasota/DevMentor/issues/18) | Booking, payment and cancellation | — | — | no |
| E03-S01 | [#29](https://github.com/LukaszLasota/DevMentor/issues/29) | A mentee can book a slot at least two hours ahead and pay through Stripe Checkout | [#18](https://github.com/LukaszLasota/DevMentor/issues/18) | E01-S04 (#24), E01-S05 (#25), E02-S01 (#27) | no |
| E03-S02 | [#30](https://github.com/LukaszLasota/DevMentor/issues/30) | A mentee can cancel free up to 24 hours before | [#18](https://github.com/LukaszLasota/DevMentor/issues/18) | E03-S01 (#29) | no |
| E04 | [#19](https://github.com/LukaszLasota/DevMentor/issues/19) | Session and note | — | — | no |
| E04-S01 | [#31](https://github.com/LukaszLasota/DevMentor/issues/31) | Mentor and mentee hold the session in text and the mentor gives a written answer | [#19](https://github.com/LukaszLasota/DevMentor/issues/19) | E03-S01 (#29) | no |
| E04-S02 | [#32](https://github.com/LukaszLasota/DevMentor/issues/32) | The mentor drafts a note and the mentee approves or declines it | [#19](https://github.com/LukaszLasota/DevMentor/issues/19) | E04-S01 (#31) | no |
| E05 | [#20](https://github.com/LukaszLasota/DevMentor/issues/20) | Later (parked) | — | — | no |
