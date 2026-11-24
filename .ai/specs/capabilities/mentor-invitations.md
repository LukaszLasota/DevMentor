# Capability: mentor-invitations

Operators invite mentors by email with a single-use link; the invited person accepts after signing in and becomes a mentor.

## Requirement: Create an invitation with the invite CLI
The system SHALL create an invitation from `npm run invite -- create --email <e> --tags <t,...> [--batch <label>] --operator <name>` only in the open batch and under the stop rule, email the link to the invited address, and print a confirmation and the token-free audit line. It SHALL print the link only when `MAIL_PROVIDER=log` (no email leaves the machine, so the operator needs the link, as today); with `MAIL_PROVIDER=resend` it never prints the link.

### Scenario: CLI create with an open batch
- WHEN an operator runs `create` with `MAIL_PROVIDER=resend` while batch N is open with fewer than 20 invitations
- THEN the invitation is created in batch N, the email goes out, stdout shows "Invitation emailed to <email> (batch N, x of 20)." and the audit line, and no link is printed

### Scenario: CLI create with the log mailer
- WHEN an operator runs `create` with `MAIL_PROVIDER=log` (local development, integration tests)
- THEN stdout shows "MAIL_PROVIDER=log: the email was not delivered." and the existing link block ("Invitation link for <email> (shown once; send it by hand):" and the link), then the confirmation "Invitation created for <email> (batch N, x of 20)." (not "emailed": nothing was delivered) and the audit line; nothing else (stderr, logs) carries the link

### Scenario: CLI create with no open batch
- WHEN no batch was ever opened
- THEN the CLI exits 1 with "No batch is open yet; open the first batch." and nothing is written

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md

## Requirement: Resend an invitation with the invite CLI
The system SHALL refuse `npm run invite -- resend <id>` while invitations are stopped (rule 6): `InvitationService.resend` throws 409 `INVITATIONS_STOPPED` with the stopped message before it touches the row; the CLI prints the message and exits 1. When not stopped, `resend` keeps its behaviour (prints its new link) and, new, logs one 'Operator action' line `invitation.resend` with `operator: { cli: 'invite-cli' }` (resend takes no `--operator`) and target `{ invitation: { id } }`.

### Scenario: Resend while stopped
- WHEN batch 1 is decided with 4 publishers and an operator resends an expired batch-1 invitation
- THEN the answer is 409 `INVITATIONS_STOPPED` with the stopped message, the token hash and `expiresAt` are unchanged, and batch 1 stays decided

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md
