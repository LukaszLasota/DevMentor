# Changelog

All notable changes to DevMentor. Versions follow [Semantic Versioning](https://semver.org/); dates are UTC.

## [1.0.0] — unreleased (draft, lesson 22)

The first release: invited senior engineers publish a mentor page and open times, and a developer books and prepays a 25- or 50-minute text session that happens in DevMentor.

### ✨ Features

**Accounts and invitations (E01)**
- Sign-in with GitHub and with email + password; roles mentee, mentor, operator (#43).
- Mentor invitations by single-use link through `npm run invite` (#43); invitation batches of 20 with the two-week publish check and the D13 stop rule, operator page `/admin/invitations` (#100).
- Mentor page with public work, stack tags, publish gate and share link (#48); open times with the two-hour lead-time state (#50); 25/50-minute prices in PLN within operator bounds (#51).
- Stripe Connect onboarding and mentor payouts minus the 20% platform fee (#65).

**Finding a mentor (E02)**
- Public `/mentors` list by stack tag, most recent availability first (#52); the share-link page with preview metadata, `noindex` (#53).

**Booking and payment (E03)**
- Book a time and pay through Stripe Checkout; durable Stripe webhook inbox (#55, #56).
- Cancel free up to 24 hours ahead with an automatic Stripe refund; dispute reports for operators (#58, #59).

**Text sessions (E04)**
- The text session in DevMentor and the mentor's written answer (#61); the session note the mentee approves or declines (#63).

### 🔒 Security
- Agent workshop hardening: deny rules, sandbox, `PreToolUse` hook, CODEOWNERS (#44).
- Threat model, access-control checks, SAST/DAST; an operator cannot resolve a dispute on their own booking (#92).
- A hold is paid only by its own Checkout session (T-08); operator actions in logs (T-14) (#94).
- Production requires trusted proxy hops (T-12); per-IP limit on booking starts (T-11) (#95).
- One unpaid hold per mentee; rate limits on booking writes (#67). Next.js 16.4.6 for security advisories (#73).

### 🐛 Fixes
- `CrudForm` no longer loses the first submit click after a field error (#42).
- No blank mentor name or dead link after a mentor unpublishes (#88); one mentor-name fallback everywhere (#89).
- The session length on the mentor page reads as a choice (#97).

### 🛠️ Engineering
- npm-workspaces monorepo, engineering standards, local PostgreSQL, one-command setup (#1, #3, #4, #5, #14).
- CI with 100% unit coverage and integration tests (testcontainers + agent-browser) (#6, #72); nightly checks (#84); lint gate for the mentor-name fallback and a ruleset on `main` (#96).
- Design system with Storybook (#37, #39); agent pipeline, skills and multi-model review harness (#8, #9, #46, #101).

[1.0.0]: https://github.com/LukaszLasota/DevMentor/releases/tag/v1.0.0
