# Mentor onboarding — discovery prototype, revision 001

- Brief: `.ai/specs/product-brief.md`, Key flow "Mentor onboarding (1.0)".
- Date: 2026-10-23. Previous revision: none. Panel report: none supplied (no `om-synthetic-users` run before this prototype).
- Simulation boundary confirmed by the session owner (Łukasz Lasota) on 2026-10-23, with the assumptions below.
- Fictitious data only. This prototype tests sequence, labels, choices and recovery paths. It is not research evidence, not a product design and does not satisfy the Definition of Ready.

## How to open
Open `index.html` in a browser (file:// works, no server, no network). "Reset prototype" in the Test state panel restores the start. The Test state panel holds prototype controls only, not product features.

## Actor, start, success
- Actor: an invited senior engineer (demo account "Marta Kowal", `marta@devmentor.test`).
- Start: Marta opens her invitation link. The operator created it by hand in the terminal (R16), so invitation creation is not simulated.
- Success: the page is published, both prices are set, one slot at least two hours ahead is published (status "bookable") and the share link is copied. This is the D13 / R13 check: one bookable session within two weeks of accepting.

## Rules and decisions kept
| ID | Meaning in this flow | Owner / status | Source |
|---|---|---|---|
| R11, D12 | Sign in with GitHub for every role; email is the fallback | founder A, active | brief |
| R13, D13, D24 | Invitation only; asks for one bookable session within two weeks; no "become a mentor" path | founders A and B, active | brief |
| R16, D19 | Operator actions without a screen are done by hand | founders A and B, active | brief |
| R04, N02 | Mentor page shows public work and a plain description; no ratings or scores | founder A, active | brief |
| R12, D14, D15 | Mentor sets 25- and 50-minute prices within operator bounds; 20% platform fee | founder A, active | brief |
| R02, R01, N01 | Sessions are 25 or 50 minutes, text only, no video | founder A, active | brief |
| R09 | A slot is bookable only when it starts at least two hours later | founder A, active | brief |
| R14 | Stripe Connect before the first payout | founder A, active | brief |
Change path for any of these: the superseding record named in the brief's tables.

## Assumptions
- `[ASSUMPTION] A1` Currency USD, price bounds $20.00–$200.00. Needed to show a bound error. Open in the prices spec as Q-P1/Q-P2 (founder A). Check: founder decision.
- `[ASSUMPTION] A2` "Now" is Tue 3 Nov 2026, 10:00 Europe/Warsaw (UTC+1); acceptance happens at that moment, so the publish-by date is Tue 17 Nov 2026 (14 days, spec #22 default). Needed for a deterministic clock.
- `[ASSUMPTION] A3` Stripe Connect is optional in onboarding and does not block publishing or booking. Backlog moved E01-S06 to 1.1; R07 ("no bank details before the first booking") is only a proposal. Check: founder A on R07 and Q04.
- `[ASSUMPTION] A4` Publishing a slot that starts less than two hours from now is refused with the earliest valid time. R09 governs booking, not publishing; spec #25 should confirm.
- `[ASSUMPTION] A5` Page validation: public work link must start with https://, description 20–500 characters, at least one stack tag. Lengths are not in the brief.
- `[ASSUMPTION] A6` Copy texts for errors follow the approved Storybook copy where it exists (GitHub errors, invalid invitation); the rest is prototype copy.
- `[ASSUMPTION] A7` Screen-map decisions of 2026-10-23 (`lekcja-07/mapa-ekranow.md` §7) applied where they touch this flow: account strip with Sign out (L04), "This page is for mentors." (L03), "You are already a mentor." (L07).

## Excluded destinations
- Email registration and verification: "Use email instead" announces that it is outside this prototype (covered by the Epic 01 prototype).
- Invitation creation by the operator, booking, payment, settlement, mentor list: not simulated.
- The share URL uses the reserved `devmentor.example` domain and is shown as text, not a link.

## Screen and state map
| ID | Screen | Action → next state | Rules / assumptions |
|---|---|---|---|
| `invitation` | Invitation | signed out: Sign in with GitHub → `github`; GitHub unavailable → alert; invalid link → one sentence, no form; other email → both addresses + Sign out, no Accept; matching email → Accept → `mentor`; already a mentor → link to `mentor` | R11, R13, A7 |
| `github` | Simulated GitHub | Authorize → `invitation` signed in; Cancel → `invitation` with cancelled alert | R11 |
| `mentor` | Mentor home | publish-by date, bookable status, four steps, payouts line; not signed in or not a mentor → guard message | R13, D13, A2, A3 |
| `profile` | Fill your page | empty submit → inline errors, focus first; valid → published → `mentor` | R04, N02, A5 |
| `prices` | Set your prices | out of bounds → error naming the range; valid → `mentor` | R12, A1 |
| `slots` | Publish slots | empty state; past or < 2 h → error with earliest time; valid → listed; Remove asks first, Keep it cancels | R09, A4 |
| `share` | Share your link | not published → link to `profile`; Copy link → step done; preview shows prices and open slots or "Not bookable yet." | R04, N02, R01 |
| `payouts` | Payouts | Connect → connected; Stripe unavailable → alert, page stays published | R14, A3 |
| `not-found` | Unknown fragment | Back to the start → `invitation` | — |

## Verification (2026-10-23)
Static review: all destinations are in-page fragments; no scripts, styles, fonts or images are loaded from outside; no fetch, storage or cookies; forms prevent submission; input text goes into text nodes only. Passed.

Browser walk: `agent-browser` 0.39.1 (project dependency, `node_modules/.bin`; the descriptor pins 0.35.2 for self-install, the existing healthy binary was used), session `proto-mo-001`, Chromium, `file://`. Script: `evidence/walk.sh`. 49 of 49 checks passed; session closed.

| Check | Result | Evidence |
|---|---|---|
| Entry state, invitation ask | pass | `evidence/01-invitation-signed-out.png` |
| GitHub unavailable / cancelled | pass | `evidence/02-github-unavailable.png`, `evidence/03-github-cancelled.png` |
| Mismatched email, no Accept | pass | `evidence/04-invitation-mismatch.png` |
| Invalid invitation | pass | `evidence/05-invitation-invalid.png` |
| Guard when signed out | pass | — |
| Accept → mentor home, publish-by date, roles | pass | `evidence/06-mentor-home-start.png` |
| Page form: invalid submit, focus first error, correction | pass | `evidence/07-profile-errors.png` |
| Prices out of bounds, correction | pass | `evidence/08-prices-error.png` |
| Slots: empty, too soon, published, remove confirmation | pass | `evidence/09-slot-too-soon.png`, `evidence/10-slots-published.png` |
| Status becomes bookable; share preview with prices, no ratings | pass | `evidence/11-share-preview.png` |
| Stripe unavailable, then connected; all steps done | pass | `evidence/12-payouts-error.png`, `evidence/13-mentor-home-done.png` |
| Unknown fragment recovery, browser back/forward | pass | `evidence/14-not-found.png` |
| Heading focus after navigation, Tab order, visible focus | pass | — |
| Loading state (slow network) | pass | `evidence/15-loading.png` |
| 320 px viewport, no horizontal scroll | pass | `evidence/16-narrow-320.png` |
| Reset restores start, signs out, clears outcomes | pass | — |

Limits: native date and time inputs were filled with real keystrokes after focusing them by id, because the accessibility snapshot exposes only their picker buttons. Screen-reader output was not checked.
