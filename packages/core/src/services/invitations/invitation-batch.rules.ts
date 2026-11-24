// Pure rules of invitation batches (spec 2026-11-24-invitation-batches, R13/D13): status words,
// counts, the stop rule. No I/O and no `@devmentor/db` values at module scope (lesson 2026-10-26).

/** Invitations per batch (R13). A constant, not an env var. */
export const INVITATION_BATCH_SIZE = 20;

/** D13: fewer than this many "Published a slot" in a decided batch 1 stops further invitations. */
export const D13_MIN_PUBLISHED = 5;

export const NO_OPEN_BATCH_MESSAGE = 'No batch is open yet; open the first batch.';
export const BATCH_FULL_MESSAGE = 'This batch is full; open a new batch.';
export const BATCH_ALREADY_OPEN_MESSAGE = 'A batch is already open.';
export const INVITATIONS_STOPPED_MESSAGE =
  'Invitations are stopped: fewer than 5 of the first 20 published a slot within two weeks. Interview the decliners first.';
export const INVITATION_MAIL_FAILED_MESSAGE = 'The invitation email could not be sent. Nothing was saved; try again.';

/** Status codes of rule 3; the UI maps them to the words ("Waiting for acceptance", …). */
export type InvitationRowStatus = 'revoked' | 'waiting' | 'expired' | 'published' | 'accepted_no_slot' | 'no_slot_in_window';

export interface StatusInput {
  revokedAt: Date | null;
  acceptedAt: Date | null;
  expiresAt: Date;
  publishDueAt: Date | null;
}

/**
 * Rule 3 at `now`, first match wins. `slotCreatedAt`: creation times of every slot (removed ones
 * too) of the accepting mentor's profile. A slot counts when created in `[acceptedAt, publishDueAt]`.
 * A null `publishDueAt` on an accepted row (accepted before the column existed) means no deadline is
 * known: any slot after acceptance publishes, and without one it stays "Accepted, no slot yet" —
 * never "No slot within two weeks".
 */
export function invitationStatus(row: StatusInput, slotCreatedAt: readonly Date[], now: Date): InvitationRowStatus {
  if (row.revokedAt !== null) {
    return 'revoked';
  }

  const { acceptedAt, publishDueAt } = row;

  if (acceptedAt === null) {
    return row.expiresAt > now ? 'waiting' : 'expired';
  }

  const published = slotCreatedAt.some((at) => at >= acceptedAt && (publishDueAt === null || at <= publishDueAt));

  if (published) {
    return 'published';
  }

  return publishDueAt === null || now <= publishDueAt ? 'accepted_no_slot' : 'no_slot_in_window';
}

export interface BatchCounts {
  sent: number;
  accepted: number;
  published: number;
}

/** Rule 4: sent = every invitation of the batch, accepted = `acceptedAt` set, published = status "published". */
export function batchCounts(rows: readonly { acceptedAt: Date | null; status: InvitationRowStatus }[]): BatchCounts {
  return {
    sent: rows.length,
    accepted: rows.filter((row) => row.acceptedAt !== null).length,
    published: rows.filter((row) => row.status === 'published').length,
  };
}

export interface StopState {
  /** Batch 1 holds 20 invitations and none is still waiting or inside its window. */
  decided: boolean;
  published: number;
  stopped: boolean;
}

/**
 * Rule 5 (D13), from batch 1 and the statuses of its invitations. Computed on every request that
 * needs it, never stored. `resumedAt` on batch 1 lifts the stop.
 */
export function stopState(batch1: { resumedAt?: Date | null } | null, statuses: readonly InvitationRowStatus[]): StopState {
  const published = statuses.filter((status) => status === 'published').length;
  const decided =
    batch1 !== null &&
    statuses.length >= INVITATION_BATCH_SIZE &&
    statuses.every((status) => status !== 'waiting' && status !== 'accepted_no_slot');

  return { decided, published, stopped: decided && batch1.resumedAt == null && published < D13_MIN_PUBLISHED };
}

export type BatchStateLabel = 'open' | 'full' | 'stopped';

/** "Stopped" for batch 1 and for the open batch while invitations are stopped; otherwise open or full. */
export function batchState(batch: { number: number; closedAt: Date | null }, stopped: boolean): BatchStateLabel {
  if (stopped && (batch.number === 1 || batch.closedAt === null)) {
    return 'stopped';
  }

  return batch.closedAt === null ? 'open' : 'full';
}
