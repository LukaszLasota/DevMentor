import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from './user.entity';

/** How long a verification link stays valid (sign-in spec, Data Model). */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const now = () => new Date();

/**
 * Single-use link token mailed at registration: using it sets the password and verifies the email.
 * Only the SHA-256 hash (`hashToken`) is stored; the raw token exists only in the mail. Rows go
 * with their user (`on delete cascade`).
 */
export const EmailVerificationTokenSchema = defineEntity({
  name: 'EmailVerificationToken',
  tableName: 'email_verification_tokens',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    // Indexed: Postgres does not index foreign keys, and the cascade and per-user lookups need it.
    user: () => p.manyToOne(UserSchema).ref().deleteRule('cascade').index(),
    tokenHash: p.text().unique(),
    /** Stored, not derived from `created_at`, so the TTL can change without moving live links. */
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class EmailVerificationToken extends EmailVerificationTokenSchema.class {}

EmailVerificationTokenSchema.setClass(EmailVerificationToken);
