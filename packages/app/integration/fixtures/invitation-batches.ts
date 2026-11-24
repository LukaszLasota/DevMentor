import { psql } from '../psql';

// Batch state for integration tests (spec 2026-11-24-invitation-batches, "Isolation of batch state").
// Batches and the D13 stop are global state in the one test database every file shares; files run
// one after another (`fileParallelism: false`), so only order matters.

/** Opener of fixture batches: `invitation_batches.opened_by_id` is NOT NULL. */
export const BATCH_OPERATOR_EMAIL = 'it-batch-operator@devmentor.test';

/**
 * No batch, no stop: every invitation becomes "created before batches". Also the cleanup a file
 * needs before an unfiltered `delete from users` (batches reference their opener, `on delete restrict`).
 */
export async function resetInvitationBatches(): Promise<void> {
  await psql('update invitations set invitation_batch_id = null where invitation_batch_id is not null; delete from invitation_batches');
}

/**
 * Closes any open batch and opens the next-numbered empty one, so fixture invitations never hit 20.
 * The batch 1 these calls create holds at most one fixture invitation: never decided, never a stop.
 * Returns the new batch number.
 */
export async function openFreshBatch(): Promise<number> {
  await psql(
    [
      `insert into users (id, email, created_at, updated_at) values (gen_random_uuid(), '${BATCH_OPERATOR_EMAIL}', now(), now()) on conflict (email) do nothing`,
      'update invitation_batches set closed_at = now(), updated_at = now() where closed_at is null',
      'insert into invitation_batches (id, number, opened_by_id, opened_at, created_at, updated_at) ' +
        `select gen_random_uuid(), coalesce(max(number), 0) + 1, (select id from users where email = '${BATCH_OPERATOR_EMAIL}'), now(), now(), now() ` +
        'from invitation_batches',
    ].join('; '),
  );
  // A separate query: psql prints a command tag ("INSERT 0 1") after `returning` rows even with -tA,
  // so reading the number from the multi-statement output gave NaN.
  const number = Number(await psql('select number from invitation_batches where closed_at is null'));

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`openFreshBatch: no open batch after the insert (got "${number}")`);
  }

  return number;
}
