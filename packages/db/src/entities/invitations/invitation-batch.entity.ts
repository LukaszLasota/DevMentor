import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';

/** Named so `InvitationBatchService` maps a lost race to open a batch (number or one-open) to 409. */
export const INVITATION_BATCH_NUMBER_UNIQUE = 'invitation_batches_number_uq';
export const INVITATION_BATCH_ONE_OPEN_UNIQUE = 'invitation_batches_one_open_uq';

/**
 * At most one open batch, enforced by the database: an expression index over `closed_at is null`,
 * partial on the open rows (a plain unique on the nullable `closed_at` would not do it, NULLs are
 * distinct). Declared here as raw DDL, so the migration and the snapshot carry the same statement.
 */
export const ONE_OPEN_BATCH_INDEX =
  `create unique index "${INVITATION_BATCH_ONE_OPEN_UNIQUE}" on "invitation_batches" ((closed_at is null)) where closed_at is null`;

export const INVITATION_BATCH_CHECKS = {
  invitation_batches_number_check: 'number > 0',
  invitation_batches_resumed_pair_check: '(resumed_at is null) = (resumed_by_id is null)',
} as const;

const now = () => new Date();

/**
 * A numbered batch of at most 20 mentor invitations (spec 2026-11-24-invitation-batches, R13/D13).
 * Batch 1 decides the D13 stop; `resumedAt`/`resumedBy` lift it (never written by that spec). A batch
 * closes with its 20th invitation and never reopens.
 */
export const InvitationBatchSchema = defineEntity({
  name: 'InvitationBatch',
  tableName: 'invitation_batches',
  checks: Object.entries(INVITATION_BATCH_CHECKS).map(([name, expression]) => ({ name, expression })),
  uniques: [
    { name: INVITATION_BATCH_NUMBER_UNIQUE, properties: ['number'] },
    { name: INVITATION_BATCH_ONE_OPEN_UNIQUE, expression: ONE_OPEN_BATCH_INDEX },
  ],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    number: p.integer(),
    // `restrict`: the batch is the audit record of who opened it. Indexed: Postgres does not index foreign keys.
    openedBy: () => p.manyToOne(UserSchema).ref().deleteRule('restrict').index(),
    openedAt: p.datetime(),
    closedAt: p.datetime().nullable(),
    resumedAt: p.datetime().nullable(),
    resumedBy: () => p.manyToOne(UserSchema).ref().nullable().deleteRule('restrict'),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class InvitationBatch extends InvitationBatchSchema.class {}

InvitationBatchSchema.setClass(InvitationBatch);
