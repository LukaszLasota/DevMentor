# Transcript — run 1, P02 (synthetic persona)

Persona: staff engineer, declines by default, short on time. Output is synthetic, not evidence.

## Interview

### Q1 Last time someone asked you for help with a technical problem — step by step?
- **Fast reaction:** Slack. Someone pinged me, I looked at it, I answered because it was something I had hit myself.
- **Feeling:** mild indifference; trigger: the question is routine to me.
- **Considered answer:** It comes in on Slack. I read it between meetings. If it's a concrete broken thing I've hit myself, I write back a few lines, sometimes the next morning. If it's "how do I start with X", I leave it. I don't open a call. I don't follow up. That's the whole process.
- **Grounded in:** "people ask all the time, Slack mainly; I answer the interesting ones — something I hit myself, a concrete broken thing."

### Q2 What did that cost you, and what did you try before?
- **Fast reaction:** Time. I don't care about money. I care about not wasting time.
- **Feeling:** moderate irritation; trigger: being reminded of the time drain.
- **Considered answer:** The cost is the interruptions, plus the questions that turn out to be vague and eat 40 minutes. The one alternative I was offered was a monthly-mentoring platform. I said no. I don't want a relationship. I want to answer the question and be left alone.
- **Grounded in:** "I don't need money, I need not to waste time"; declined a monthly-mentoring platform: "I don't want a relationship".

### Q3 Who else was involved, and who decided?
- **Fast reaction:** No basis. I decide whether I answer.
- **Feeling:** none.
- **Considered answer:** No basis. I can't name anyone else. Whether my employer has a view on paid side work, I don't know.
- **Grounded in:** none.

### Q4 What would have to be true for you to say the problem is gone?
- **Fast reaction:** Someone pays for 25 minutes, text only, and I know the question before I agree. Then maybe.
- **Feeling:** mild, guarded interest; trigger: the conditions are concrete.
- **Considered answer:** Text, no call. 25 minutes, which is fair, since most questions take 10. The question known up front, so I can say no to the boring ones. A high price, so only serious people book. And I want to reply between meetings, not be on the hook at a fixed hour.
- **Grounded in:** "if someone paid for 25 minutes, text only, no call, question up front — that I might do. Text is ok, between meetings. Price high, so only serious people book."

### Q5 What did you not care about, that we might think you do?
- **Fast reaction:** Ratings. And building a profile. I've been rated. Not doing that again.
- **Feeling:** moderate aversion; trigger: the word "rating".
- **Considered answer:** You'd think I want visibility, reviews or a following. I don't. I also won't write documentation for free. If the answer turns into a write-up, that's paid or it doesn't happen.
- **Grounded in:** "ratings? no. I've been rated."; "I don't write documentation for free."

### Q6 When did you last accept an invitation to a platform to help people, and what happened in the weeks after?
- **Fast reaction:** I didn't. I declined the last one.
- **Feeling:** mild; trigger: none, it's a fact.
- **Considered answer:** A year ago I declined a monthly-mentoring invitation, so there were no weeks after. I know how it would go, though. If I accept and nobody books me for a month, I'll forget it exists.
- **Grounded in:** declined the monthly-mentoring invitation a year ago; "if I accept and nobody books me for a month, I'll forget it exists."

### Q7 Last time you pointed someone you know to a resource of yours — how?
- **Fast reaction:** I'd send them the link. Directly.
- **Feeling:** mild; trigger: none.
- **Considered answer:** No basis for a specific last time. The way I'd want it: people I want to help find me because I sent them the link. Not a directory.
- **Grounded in:** "found by people I want to help. I'll send them the link."

### Q8 Last time you agreed to help before knowing the question — what happened?
- **Fast reaction:** I don't do that. Question first.
- **Feeling:** mild resolve; trigger: the premise.
- **Considered answer:** No basis for a specific event. Knowing the question up front is my condition. If I can't see it, I don't agree.
- **Grounded in:** "question up front" is your condition.

## Yes-no

- **Y1 Paid last time?** No. It was a Slack answer.
- **Y2 In writing rather than a call?** Yes. Slack, text.
- **Y3 Kept the answer to reuse?** No basis. Nothing tells me I did. I don't write documentation for free.
- **Y4 Signed up on a mentoring platform in the last year?** No. I declined one.

## Decision simulation

**Base decision (State 01 link, one bookable session within two weeks): accept, but publish nothing.**
I'd leave the link until the next morning. Then I'd sign in with GitHub because it's two clicks, fill the page and set $200 for both prices. I'd stop at slots, because nothing tells me I'll see the question before I'm committed, and a slot is a fixed time when I have to be there. The "within two weeks" request is the operator's goal, not mine. I'm not keeping it.

- **P1 Two weeks pass with no booking.** No flip. I'm already at "nothing published". After two weeks I've forgotten it exists. Even if I had published a slot, I wouldn't renew it.
- **P2 Public list by stack tag, next to people I don't know.** Flips the decision to **ignore**. This is exactly what I object to. I want people I send the link to, not a directory with me in it. If I can't opt out of the list, I don't accept.
- **P3 Prices $20–$200, platform keeps 20%.** No flip. $200 for 25 minutes is a high enough filter, though I'd want to set it higher. The 20% doesn't matter, because money isn't the point.
- **P4 Instant booking, question visible only when the session starts.** Hard flip to **ignore**, even if everything else were fine. It breaks "question up front". Someone could pay me to explain how to start with Kafka.
- **P5 Stripe bank details before the first payout.** No flip on its own. It's friction for something I might use once. I'd postpone it until there was an actual booking. Then I'd probably not bother.

**Where story and pressured choice part ways:** In the interview I said text, 25 minutes and a high price would make me consider it. The prototype offers all three. I still don't publish, because the conditions it doesn't meet (question up front, link-only, async reply) matter more than the ones it does.

## Walk

### State 01 — invitation-signed-out
Screenshot: screenshots/P02-01-invitation-signed-out.png
- **Notice:** "paid 25- or 50-minute text sessions"; "one bookable session within two weeks"; Sign in with GitHub.
- **Expected:** what I'd answer, how questions reach me, whether I can see the question first.
- **Got:** a format (text, 25/50 min) and an obligation (two weeks). Nothing about the question.
- **Fast reaction + feeling:** "Text, ok. Two weeks deadline, no." Mild scepticism, trigger: a deadline on a favour.
- **Friction:** the two-week ask is the first ask. Nothing says what happens if I don't meet it.
- **Missing case:** "I only take questions I've seen first." Nothing here answers that.
- **Contradiction:** none.
- **Next action:** leave it until tomorrow, then "Sign in with GitHub".

### State 02 — use-email-instead-pressed
- Would not use it. GitHub is fine.

### State 03 — github-simulated
- Expected: a GitHub authorize screen asking for public profile and email. That's fine. I'd press "Authorize DevMentor".

### State 04 — invitation-signed-in-matching
Screenshot: screenshots/P02-04-invitation-signed-in-matching.png
- **Notice:** "Signed in as … (mentee)"; "You keep your mentee role"; Accept invitation.
- **Expected:** the terms before I accept: list or link, how questions come in, any deadline consequence.
- **Got:** the same text again plus role bookkeeping.
- **Fast reaction + feeling:** "I'm a mentee now? I didn't ask for that." Mild annoyance, trigger: an unrequested role.
- **Friction:** accepting without seeing what I agree to (list visibility, the commitment).
- **Missing case:** accepting but staying off the public list, link only.
- **Contradiction:** none with the brief, which does say both roles exist.
- **Next action:** "Accept invitation", reluctantly. It costs nothing yet.

### State 05 — mentor-home-after-accept
Screenshot: screenshots/P02-05-mentor-home-after-accept.png
- **Notice:** a deadline "by Tue 17 Nov 2026"; a four-item To do list; "Payouts: not set up".
- **Expected:** a short setup. Got it.
- **Got:** a checklist with a deadline on top.
- **Fast reaction + feeling:** "A to-do list and a deadline from people I owe nothing." Moderate irritation, trigger: the deadline headline.
- **Friction:** the deadline frames this as a task I owe them. Nothing explains the list vs link visibility.
- **Missing case:** "I want a page only reachable by my link" isn't anywhere.
- **Contradiction:** none.
- **Next action:** "Fill page".

### State 06 — page-form-empty
- Expected and got: link to public work, a short description, stack tags. "No scores or ratings" is the line I like most so far. I'd fill it.

### State 07 — page-form-submitted-empty
Screenshot: screenshots/P02-07-page-form-submitted-empty.png
- **Notice:** three red errors; https:// rule; 20-character minimum.
- **Expected:** to be told what's wrong. I was.
- **Got:** clear errors.
- **Fast reaction + feeling:** "Fine." Neutral.
- **Friction:** the button says "Save and publish page". Publish where, to the list? I want save without publish.
- **Missing case:** saving a draft without going public. My stack isn't just four tags, and nothing like "infra / Kubernetes" fits what I actually do.
- **Contradiction:** none. The four tags match the brief.
- **Next action:** fill it and press "Save and publish page", uneasily.

### State 08 — mentor-home-after-page
- "Page saved and published." Published before I had prices or slots. I'd have expected it to stay hidden until bookable. Next: "Set prices".

### State 09 — prices-form-empty
Screenshot: screenshots/P02-09-prices-form-empty.png
- **Notice:** $20–$200 bounds "set by DevMentor"; 20% fee; two required price fields.
- **Expected:** to set one price for 25 minutes.
- **Got:** I have to set both 25 and 50.
- **Fast reaction + feeling:** "I don't want 50-minute sessions." Mild irritation, trigger: a forced second field.
- **Friction:** I can't switch off the 50-minute option.
- **Missing case:** offering only 25 minutes.
- **Contradiction:** none. The brief says each mentor sets both prices.
- **Next action:** try 250 and 400.

### State 10 — prices-above-upper-bound
Screenshot: screenshots/P02-10-prices-above-upper-bound.png
- **Notice:** "Enter an amount between $20.00 and $200.00" twice; my 250 and 400 rejected.
- **Expected:** to set my own filter price.
- **Got:** a cap.
- **Fast reaction + feeling:** "So the filter is capped. Fine, 200." Mild, trigger: the cap.
- **Friction:** the cap limits how hard I can filter. The 50-minute price has to be ≤ $200 too, which makes it a cheaper rate per minute. That invites the long, vague sessions I don't want.
- **Missing case:** a price above the bound, or no 50-minute option at all.
- **Contradiction:** none.
- **Next action:** 200 / 200, "Save prices".

### State 11 — mentor-home-after-prices
- Two "Done" items. Next: "Manage slots", to look, not necessarily to publish.

### State 12 — slots-empty
- Expected: a way to say "mornings on weekdays, async reply". Got: one date and one start time. A slot is a fixed hour when I have to be present. That isn't how I reply. I reply between meetings or next morning.

### State 13 — slot-less-than-two-hours
Screenshot: screenshots/P02-13-slot-less-than-two-hours.png
- **Notice:** "Mentees can book only two hours ahead"; it suggests 12:00 or later; date and time inputs.
- **Expected:** to see what a booked slot means for me: do I get the question before?
- **Got:** a rule about mentee booking lead time.
- **Fast reaction + feeling:** "Two hours' notice and I still don't know the question." Moderate scepticism, trigger: commitment without the question.
- **Friction:** nothing says I'll see the question when someone books, or that I can decline a question I don't want.
- **Missing case:** reviewing or declining a booking by its question, and an async reply instead of a fixed hour. No weekend guard is needed if I only publish weekday slots, but the screen says nothing about recurring times.
- **Contradiction:** none. The brief makes async "Later".
- **Next action:** **I stop here.** "Back to your mentor page", no slot published. This is my real exit.

### State 14 — slot-published
- Would not reach. If I had: one slot, Remove. I'd expect a note on what happens when it's booked.

### State 15 — mentor-home-bookable
Screenshot: screenshots/P02-15-mentor-home-bookable.png
- **Notice:** "Status: bookable. Mentees can book you."; three Done; Payouts still not set up.
- **Expected (had I reached it):** "bookable via your link" vs "listed publicly", stated plainly.
- **Got:** "Mentees can book you". Which mentees? Everyone on the list?
- **Fast reaction + feeling:** "Bookable by whom?" Moderate unease, trigger: the vague audience.
- **Friction:** I'm bookable before payouts exist and before I've shared anything.
- **Missing case:** link-only visibility; a pause switch so the page doesn't live on after I forget it.
- **Contradiction:** none, but it confirms the public list I object to.
- **Next action:** would not reach in my real run. If I had: "Share link".

### State 16 — share-link-and-public-preview
Screenshot: screenshots/P02-16-share-link-and-public-preview.png
- **Notice:** a personal URL with my name; a preview of my page; "Sessions are text, 25 or 50 minutes" with $200 · $200.
- **Expected:** this is the part I'd actually want. A link I send to people I choose.
- **Got:** the link, plus a preview. No ratings, which is good.
- **Fast reaction + feeling:** "This bit's right." Mild approval, trigger: link plus no scores.
- **Friction:** $200 for 25 and $200 for 50 side by side says "take the 50". The preview says nothing about the question being required up front.
- **Missing case:** making the page reachable only through this link.
- **Contradiction:** the brief also lists me on the stack-tag list. This screen implies the link is the channel.
- **Next action:** would not reach. If I had: "Copy link" and send it to one person.

### State 17 — payouts-not-set-up
Screenshot: screenshots/P02-17-payouts-not-set-up.png
- **Notice:** "Connect before your first payout"; "you can publish slots and be booked before that"; Connect with Stripe.
- **Expected:** to postpone it. That's allowed.
- **Got:** clear permission to postpone.
- **Fast reaction + feeling:** "Later. Maybe never." Neutral.
- **Friction:** bank details for something I may use once.
- **Missing case:** what happens to a mentee's money if I never connect. Not stated.
- **Contradiction:** none.
- **Next action:** "Back to your mentor page".

### State 18 — invitation-signed-in-other-email
Screenshot: screenshots/P02-18-invitation-signed-in-other-email.png
- **Notice:** the invite is for one email and I'm signed in with another; "Sign out, then sign in with …"; one button.
- **Expected:** to accept with the account I'm signed in with.
- **Got:** a dead end that sends me through sign-out and sign-in again.
- **Fast reaction + feeling:** "Then I close the tab." Moderate, trigger: extra steps for something I'm lukewarm on.
- **Friction:** realistic for me. Work email invited, personal GitHub. This is where I'd quit if it happened.
- **Missing case:** accepting on the signed-in account after confirming the invited email.
- **Contradiction:** none.
- **Next action:** most likely leave. Otherwise "Sign out".

### State 19 — invitation-not-valid
- Expected: "ask the team for a new link". I wouldn't ask. I'd take it as the answer.

## Topics

- I don't want a relationship. One question, answered, then left alone.
- Question up front: nothing shows I'll see the question before I'm committed.
- Fixed slot hours vs replying between meetings or next morning. Not at weekends.
- Being put on a public list next to people I don't know. I want to be found only through my link.
- No ratings is right and the only thing I liked straight away.
- A high price as a filter for serious people, but it's capped at $200, and the 50-minute option is forced and cheaper per minute.
- A deadline ("two weeks", "by Tue 17 Nov") on a favour I didn't ask to do.
- "Save and publish" goes public before I've decided anything.
- An unrequested mentee role.
- A wrong-email invitation dead-ends in sign-out and sign-in.
- Stripe bank details for something I might use once. I'd postpone.
- If nobody books me for a month, I'll forget it exists. There's no pause or expiry for my page.
- I don't write documentation for free.
