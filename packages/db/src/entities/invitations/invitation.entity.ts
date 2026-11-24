import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';
import { InvitationBatchSchema } from './invitation-batch.entity';

/**
 * Beachhead stacks an invitation can carry (mentor-invitations spec R16, D24), stored as lower-case
 * slugs; the UI maps them to labels (TypeScript, React, Python, AI agents).
 */
export const STACK_TAGS = ['typescript', 'react', 'python', 'ai-agents'] as const;

export type StackTag = (typeof STACK_TAGS)[number];

/**
 * Database-level guard for `invitations.stack_tags`: one-dimensional, not empty (an invitation is
 * always for at least one stack), no null members, only known tags. Duplicates are normalized by
 * `InvitationService`, not here.
 */
export const STACK_TAGS_CHECK =
  'array_ndims(stack_tags) = 1 and cardinality(stack_tags) > 0 and array_position(stack_tags, null) is null' +
  ` and stack_tags <@ array[${STACK_TAGS.map((tag) => `'${tag}'`).join(', ')}]::text[]`;

/** `accepted_at` and `accepted_by_id` are written together. */
export const ACCEPTED_PAIR_CHECK = '(accepted_at is null) = (accepted_by_id is null)';

/** Predicate of the partial unique index on `email`: one unresolved invitation per address. */
export const UNRESOLVED_INVITATION = 'accepted_at is null and revoked_at is null';

const now = () => new Date();

/**
 * Operator-issued link that grants the `mentor` role to the account with the same verified email.
 * Only the SHA-256 hash of the token is stored; the raw token exists only in the link. `email` is
 * stored normalized (trimmed, lower-cased) by `InvitationService`.
 */
export const InvitationSchema = defineEntity({
  name: 'Invitation',
  tableName: 'invitations',
  checks: [
    { name: 'invitations_stack_tags_check', expression: STACK_TAGS_CHECK },
    { name: 'invitations_accepted_pair_check', expression: ACCEPTED_PAIR_CHECK },
  ],
  uniques: [{ name: 'invitations_email_unresolved_unique', properties: ['email'], where: UNRESOLVED_INVITATION }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    email: p.text(),
    tokenHash: p.text().unique(),
    stackTags: p.array<StackTag>(),
    /** Free-text label from the CLI's `--batch` (e.g. `2026-10-a`); kept beside the numbered batch. */
    batch: p.text().nullable(),
    // Null only for invitations created before batches (spec 2026-11-24-invitation-batches); the service
    // gives every new row one. `restrict`: a batch is never deleted while it holds invitations.
    invitationBatch: () => p.manyToOne(InvitationBatchSchema).ref().nullable().deleteRule('restrict').index(),
    /** Stored, not derived from `created_at`, so the TTL can change without moving live links. */
    expiresAt: p.datetime(),
    acceptedAt: p.datetime().nullable(),
    // Not unique: a removed mentor can be invited again. `restrict`: an accepted invitation is the
    // audit record of the grant, and MikroORM's default for a nullable relation (`set null`) would
    // only trip the accepted-pair CHECK. Indexed: Postgres does not index foreign keys.
    acceptedBy: () => p.manyToOne(UserSchema).ref().nullable().deleteRule('restrict').index(),
    publishDueAt: p.datetime().nullable(),
    revokedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class Invitation extends InvitationSchema.class {}

InvitationSchema.setClass(Invitation);
