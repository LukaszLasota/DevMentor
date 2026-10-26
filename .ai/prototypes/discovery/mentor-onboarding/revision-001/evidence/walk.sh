#!/usr/bin/env bash
# Browser walk for the mentor-onboarding discovery prototype (revision-001).
set -u
cd /home/lukasz/projects/devMentor/my-app
export AGENT_BROWSER_SESSION=proto-mo-001
AB=node_modules/.bin/agent-browser
REV=$PWD/.ai/prototypes/discovery/mentor-onboarding/revision-001
EV=$REV/evidence
FAIL=0; N=0
ab() { "$AB" "$@" >/dev/null 2>&1 || { echo "  !! command failed: $*"; FAIL=$((FAIL+1)); }; }
ev() { "$AB" eval "$1" 2>/dev/null | tail -1 | sed 's/^"//; s/"$//'; }
h1() { ev "document.querySelector('main section:not([hidden]) h1').textContent"; }
screen() { ev "document.querySelector('main section:not([hidden])').innerText.replace(/\\n/g,' | ')"; }
st() { ev "document.getElementById('status').textContent"; }
check() { N=$((N+1)); if printf '%s' "$2" | grep -qF -- "$3"; then echo "ok  $N $1"; else echo "FAIL $N $1 — expected [$3] got [$2]"; FAIL=$((FAIL+1)); fi; }
shot() { "$AB" screenshot --full "$EV/$1.png" >/dev/null 2>&1 && test -s "$EV/$1.png" && echo "    📸 evidence/$1.png" || { echo "  !! screenshot $1 failed"; FAIL=$((FAIL+1)); }; }
btn() { ab find role button click --name "$1"; }
keys() { ab focus "$1"; for k in $(printf "%s" "$2" | fold -w1); do ab press "$k"; done; }
link() { ab find role link click --name "$1"; }

ab set viewport 1280 900
ab open "file://$REV/index.html"
check "entry: invitation" "$(h1)" "Mentor invitation"
check "entry: invited address and ask" "$(screen)" "one bookable session within two weeks"
shot 01-invitation-signed-out

# GitHub unavailable
ab find role radio click --name "GitHub unavailable" --exact
btn "Sign in with GitHub"
check "github unavailable alert" "$(screen)" "GitHub sign-in is not available right now"
shot 02-github-unavailable
ab find role radio click --name "GitHub available" --exact

# Cancel on GitHub
btn "Sign in with GitHub"
check "simulated GitHub screen" "$(h1)" "Authorize DevMentor"
check "heading focused after navigation" "$(ev 'document.activeElement.id')" "github-h"
btn "Cancel"
check "github cancelled alert" "$(screen)" "You cancelled GitHub sign-in"
shot 03-github-cancelled

# Mismatched email
ab find role radio click --name "GitHub email marta.k@personal.test (other)" --exact
btn "Sign in with GitHub"; btn "Authorize DevMentor"
check "mismatch: both addresses, no accept" "$(screen)" "You are signed in as marta.k@personal.test"
check "mismatch: no Accept button" "$(ev "String(!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Accept invitation'))")" "false"
shot 04-invitation-mismatch
ab find role button click --name "Sign out" --exact
ab find role radio click --name "GitHub email marta@devmentor.test (invited)" --exact
check "signed out" "$(ev "document.getElementById('account').innerText")" "Not signed in"

# Invalid invitation
ab find role radio click --name "Invitation expired, revoked or used" --exact
check "invalid invitation sentence, no form" "$(screen)" "This invitation is not valid"
shot 05-invitation-invalid
ab find role radio click --name "Invitation valid" --exact

# Guard while signed out
ab eval "location.hash='mentor'"
check "guard: signed out on /mentor" "$(screen)" "Sign in to see this page."

# Happy path: sign in and accept
link "Go to your invitation"
btn "Sign in with GitHub"; btn "Authorize DevMentor"
check "match: accept offered" "$(screen)" "The mentor role goes to"
btn "Accept invitation"
check "mentor home" "$(h1)" "Your mentor page"
check "publish-by date" "$(screen)" "Publish at least one bookable session by Tue 17 Nov 2026"
check "not bookable yet" "$(screen)" "Status: not bookable yet."
check "roles in account strip" "$(ev "document.getElementById('account').innerText")" "mentee, mentor"
shot 06-mentor-home-start

# Profile: invalid then corrected
link "Fill page"
btn "Save and publish page"
check "profile errors" "$(screen)" "Enter a link that starts with https://"
check "tags error" "$(screen)" "Pick at least one stack tag."
check "focus on first invalid field" "$(ev 'document.activeElement.id')" "work-url"
shot 07-profile-errors
ab find label "Link to public work" fill "https://github.com/example-org/ingress-runbook/pull/42"
ab find label "What you have done" fill "Upgraded ingress-nginx on a 40-node cluster without downtime and wrote the runbook."
ab find label "TypeScript" check
btn "Save and publish page"
check "profile saved" "$(st)" "Page saved and published."
check "back on mentor home" "$(h1)" "Your mentor page"

# Prices: out of bounds then corrected
link "Set prices"
ab find label "Price for a 25-minute session (USD)" fill "10"
ab find label "Price for a 50-minute session (USD)" fill "75"
btn "Save prices"
check "price bound error" "$(screen)" "Enter an amount between \$20.00 and \$200.00."
shot 08-prices-error
ab find label "Price for a 25-minute session (USD)" fill "40"
btn "Save prices"
check "prices saved" "$(st)" "\$40.00 for 25 minutes, \$75.00 for 50 minutes"

# Slots: empty, too soon, published, remove-cancel
link "Manage slots"
check "slots empty state" "$(screen)" "No slots yet."
keys "#slot-date" 11032026
keys "#slot-time" 1100A
btn "Publish slot"
check "two-hour rule" "$(screen)" "Mentees can book only two hours ahead. Pick Tue 3 Nov 2026, 12:00 or later."
shot 09-slot-too-soon
keys "#slot-date" 11052026
keys "#slot-time" 0630P
btn "Publish slot"
check "slot published" "$(screen)" "Thu 5 Nov 2026, 18:30"
ab find role button click --name "Remove slot on Thu 5 Nov 2026, 18:30"
check "remove asks first" "$(screen)" "Remove the slot on Thu 5 Nov 2026, 18:30?"
btn "Keep it"
check "slot kept" "$(screen)" "Thu 5 Nov 2026, 18:30"
shot 10-slots-published
link "Back to your mentor page"
check "bookable now" "$(screen)" "Status: bookable."

# Share
link "Share link"
btn "Copy link"
check "copied" "$(st)" "Link copied (simulated)."
check "preview shows prices" "$(screen)" "25 minutes: \$40.00 · 50 minutes: \$75.00"
check "preview has no ratings" "$(ev "String(/rating|stars|review/i.test(document.querySelector('.preview').innerText))")" "false"
shot 11-share-preview

# Payouts: Stripe down, then connected
ab eval "location.hash='payouts'"
ab find role radio click --name "Stripe unavailable" --exact
btn "Connect with Stripe"
check "stripe unavailable" "$(screen)" "Stripe is not available right now"
shot 12-payouts-error
ab find role radio click --name "Stripe available" --exact
btn "Connect with Stripe"
check "stripe connected" "$(screen)" "Status: connected (simulated)."
ab eval "location.hash='mentor'"
check "all steps done" "$(ev "String(document.querySelectorAll('.checklist .state').length - Array.from(document.querySelectorAll('.checklist .state')).filter(s=>s.textContent==='Done').length)")" "0"
shot 13-mentor-home-done

# Unknown fragment, back/forward
ab eval "location.hash='nope'"
check "unknown fragment recovery" "$(h1)" "Screen not found"
shot 14-not-found
ab back
check "browser back" "$(h1)" "Your mentor page"
ab forward
check "browser forward" "$(h1)" "Screen not found"
link "Back to the start"
check "recovery link" "$(h1)" "Mentor invitation"
check "already a mentor (second tab case)" "$(screen)" "You are already a mentor."

# Keyboard
ab eval "location.hash='prices'"
ab press Tab
check "keyboard: Tab from heading reaches first field" "$(ev 'document.activeElement.tagName + document.activeElement.id')" "INPUTprice25"
check "visible focus style" "$(ev "getComputedStyle(document.activeElement, ':focus-visible') && getComputedStyle(document.activeElement).outlineStyle")" "solid"

# Slow network loading
ab find role checkbox check --name "Slow (shows loading)"
btn "Save prices"
check "loading state" "$(ev "Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Saving…' && b.disabled)")" "true"
shot 15-loading
ab wait 1200
check "loading resolves" "$(h1)" "Your mentor page"

# Narrow viewport
ab set viewport 320 800
check "no horizontal scroll at 320px" "$(ev 'String(document.documentElement.scrollWidth <= document.documentElement.clientWidth)')" "true"
shot 16-narrow-320
ab set viewport 1280 900

# Reset
btn "Reset prototype"
check "reset to start" "$(h1)" "Mentor invitation"
check "reset announced" "$(st)" "Prototype reset."
check "reset signs out" "$(ev "document.getElementById('account').innerText")" "Not signed in"
ab eval "location.hash='share'"
check "reset clears simulated outcome" "$(screen)" "Sign in to see this page."

"$AB" close >/dev/null 2>&1 && echo "closed" || echo "!! close failed"
echo "checks: $N, failures: $FAIL"
