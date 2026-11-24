# QA risk hotspots

## Mentor page and booking

- **Static chips that look like controls** — price or tag chips styled like the length options read as clickable and send testers the wrong way ("I cannot choose anything"). Check every pill-shaped element near a control. *Seen while testing #79 — the "Sessions" price chips above the times.*
- **Headless hover is not evidence** — agent-browser did not apply :hover on the length option, so a hover check from the AI session is inconclusive; keep hover and dark-mode cases human-only. *Seen while testing #79.*
- **Short busy states (booking "Opening payment…")** — gone in a fraction of a second on localhost; a human can only check the lock with the network throttled (DevTools → Slow 3G). Dark mode has no user switch: test it by adding the `dark` class from the console, or mark it not applicable. (#79, 2026-11-24)
