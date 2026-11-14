import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { entities } from '../index';
import {
  EMAIL_VERIFICATION_TTL_MS,
  EmailVerificationToken,
  EmailVerificationTokenSchema,
} from './email-verification-token.entity';
import { User } from './user.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(EmailVerificationToken);

afterAll(async () => {
  await orm.close();
});

describe('EmailVerificationToken entity', () => {
  it('is registered and maps to email_verification_tokens with a uuid key', () => {
    expect(entities).toContain(EmailVerificationTokenSchema);
    expect(meta.tableName).toBe('email_verification_tokens');
    expect(meta.primaryKeys).toEqual(['id']);
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(Object.keys(meta.properties).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'tokenHash',
      'updatedAt',
      'usedAt',
      'user',
    ]);
    expect(column('id')).toEqual({ field: 'id', type: 'uuid', nullable: false });
    expect(column('tokenHash')).toEqual({ field: 'token_hash', type: 'text', nullable: false });
    expect(column('expiresAt')).toEqual({ field: 'expires_at', type: 'timestamptz', nullable: false });
    expect(column('usedAt')).toEqual({ field: 'used_at', type: 'timestamptz', nullable: true });
    expect(column('createdAt')).toEqual({ field: 'created_at', type: 'timestamptz', nullable: false });
    expect(column('updatedAt')).toEqual({ field: 'updated_at', type: 'timestamptz', nullable: false });
    expect(meta.properties.tokenHash.unique).toBe(true);
  });

  it('references users with an indexed, cascading foreign key', () => {
    const user = meta.properties.user;

    expect(user.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(user.targetMeta?.class).toBe(User);
    expect(user.fieldNames).toEqual(['user_id']);
    expect(user.deleteRule).toBe('cascade');
    expect(user.index).toBe(true);
    expect(user.nullable).toBeFalsy();
  });

  it('generates the id and timestamps on create and keeps the TTL at 24 hours', () => {
    const before = Date.now();
    const id = meta.properties.id.onCreate?.({} as EmailVerificationToken, orm.em);
    const createdAt = meta.properties.createdAt.onCreate?.({} as EmailVerificationToken, orm.em) as Date;
    const updatedAt = meta.properties.updatedAt.onUpdate?.({} as EmailVerificationToken, orm.em) as Date;

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(EMAIL_VERIFICATION_TTL_MS).toBe(86_400_000);
  });
});
