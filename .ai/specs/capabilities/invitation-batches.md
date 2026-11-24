# Capability: invitation-batches

Operators invite mentors in numbered batches of at most 20 and see, per batch, who published a slot within two weeks; the D13 stop rule halts invitations.

## Requirement: Batches of at most 20, one open at a time
The system SHALL create every new invitation in the single open batch, close that batch when its 20th invitation is created, and let an operator open the next batch only when none is open and invitations are not stopped.

### Scenario: The 21st invitation
- WHEN batch N holds 20 invitations and an operator submits another
- THEN the answer is 409 "This batch is full; open a new batch." and no row is written

### Scenario: Losing the race for the 20th invitation
- WHEN two operators submit the 20th invitation of batch N at once and the other request closes batch N first
- THEN after taking the lock the loser finds no open batch and the latest batch closed, and answers 409 `BATCH_FULL` "This batch is full; open a new batch." (never `NO_OPEN_BATCH`, which is only for "no batch exists at all"); batch N ends with 20

### Scenario: Opening while a batch is open
- WHEN a batch is open and an operator opens another
- THEN the answer is 409 "A batch is already open." and no batch is created

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md

## Requirement: Invitation status in words
The system SHALL show each invitation's status as exactly one of the six words of rule 3, evaluated at the injected clock's now.

### Scenario: Slot exactly at the deadline
- WHEN an accepted mentor's only slot was created exactly at `publishDueAt`
- THEN the status is "Published a slot"

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md

## Requirement: D13 stop
The system SHALL refuse new invitations and new batches once batch 1 is decided with fewer than 5 "Published a slot", until batch 1 has `resumedAt`.

### Scenario: 4 of 20
- WHEN batch 1 is decided with 4 publishers
- THEN creating an invitation or opening a batch answers 409 with the stopped message and the page shows the banner without form or open button

### Scenario: 5 of 20
- WHEN batch 1 is decided with 5 publishers
- THEN invitations are not stopped

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md

## Requirement: Operator actions are logged
The system SHALL log every operator action of this spec with the existing T-14 pattern `logger.info({ operator: { id }, action, target }, 'Operator action')` (as `http/payouts.ts` does): `invitation-batch.open` (target `{ batch: { number } }`), `invitation.create` (target `{ invitation: { id }, batch: { number } }`) and `invitation.resend` when it succeeds (target `{ invitation: { id } }`); and SHALL log every request refused because invitations are stopped. No log line carries the token, token hash, link or invited email.

### Scenario: Refused while stopped
- WHEN invitations are stopped and an operator creates an invitation, opens a batch or resends
- THEN the request is refused and one line `{ operator, action, refused: 'INVITATIONS_STOPPED' }` with message 'Operator action refused' is logged

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md

## Requirement: Invitation email before commit
The system SHALL email the invitation to the invited address before committing the invitation; when the mailer rejects, nothing is saved.

### Scenario: Mailer down
- WHEN the mailer rejects
- THEN the answer is 503 "The invitation email could not be sent. Nothing was saved; try again.", the batch count is unchanged and the same email can be submitted again

Source: .ai/specs/implemented/2026-11-24-invitation-batches.md
