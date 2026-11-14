import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { User } from '../auth/user.entity';
import { entities } from '../index';
import {
  ACCEPTED_PAIR_CHECK,
  Invitation,
  InvitationSchema,
  STACK_TAGS,
  STACK_TAGS_CHECK,
  UNRESOLVED_INVITATION,
} from './invitation.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(Invitation);

afterAll(async () => {
  await orm.close();
});

describe('Invitation entity', () => {
  it('is registered and maps to invitations with a uuid key', () => {
    expect(entities).toContain(InvitationSchema);
    expect(meta.tableName).toBe('invitations');
    expect(meta.primaryKeys).toEqual(['id']);
  });

  it('defines the beachhead stack tags as lower-case slugs', () => {
    expect(STACK_TAGS).toEqual(['typescript', 'react', 'python', 'ai-agents']);
  });

  it('declares the stack tags and accepted-pair CHECKs', () => {
    expect(meta.checks).toEqual([
      { name: 'invitations_stack_tags_check', expression: STACK_TAGS_CHECK },
      { name: 'invitations_accepted_pair_check', expression: ACCEPTED_PAIR_CHECK },
    ]);
    expect(STACK_TAGS_CHECK).toBe(
      'array_ndims(stack_tags) = 1 and cardinality(stack_tags) > 0 and array_position(stack_tags, null) is null' +
        " and stack_tags <@ array['typescript', 'react', 'python', 'ai-agents']::text[]",
    );
    expect(ACCEPTED_PAIR_CHECK).toBe('(accepted_at is null) = (accepted_by_id is null)');
  });

  it('keeps one unresolved invitation per email with a partial unique index', () => {
    expect(meta.uniques).toEqual([
      { name: 'invitations_email_unresolved_unique', properties: ['email'], where: UNRESOLVED_INVITATION },
    ]);
    expect(UNRESOLVED_INVITATION).toBe('accepted_at is null and revoked_at is null');
  });

  it('maps every column with its type, nullability and uniqueness', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return {
        field: prop.fieldNames[0],
        type: prop.columnTypes[0],
        nullable: Boolean(prop.nullable),
        unique: Boolean(prop.unique),
      };
    };

    expect(Object.keys(meta.properties).sort()).toEqual([
      'acceptedAt',
      'acceptedBy',
      'batch',
      'createdAt',
      'email',
      'expiresAt',
      'id',
      'publishDueAt',
      'revokedAt',
      'stackTags',
      'tokenHash',
      'updatedAt',
    ]);
    expect(column('id')).toEqual({ field: 'id', type: 'uuid', nullable: false, unique: false });
    expect(column('email')).toEqual({ field: 'email', type: 'text', nullable: false, unique: false });
    expect(column('tokenHash')).toEqual({ field: 'token_hash', type: 'text', nullable: false, unique: true });
    expect(column('stackTags')).toEqual({ field: 'stack_tags', type: 'text[]', nullable: false, unique: false });
    expect(column('batch')).toEqual({ field: 'batch', type: 'text', nullable: true, unique: false });
    expect(column('expiresAt')).toEqual({ field: 'expires_at', type: 'timestamptz', nullable: false, unique: false });
    expect(column('acceptedAt')).toEqual({ field: 'accepted_at', type: 'timestamptz', nullable: true, unique: false });
    expect(column('publishDueAt')).toEqual({
      field: 'publish_due_at',
      type: 'timestamptz',
      nullable: true,
      unique: false,
    });
    expect(column('revokedAt')).toEqual({ field: 'revoked_at', type: 'timestamptz', nullable: true, unique: false });
    expect(column('createdAt')).toEqual({ field: 'created_at', type: 'timestamptz', nullable: false, unique: false });
    expect(column('updatedAt')).toEqual({ field: 'updated_at', type: 'timestamptz', nullable: false, unique: false });
  });

  it('references the accepting user with a nullable, non-unique, indexed, restricting foreign key', () => {
    const acceptedBy = meta.properties.acceptedBy;

    expect(acceptedBy.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(acceptedBy.targetMeta?.class).toBe(User);
    expect(acceptedBy.fieldNames).toEqual(['accepted_by_id']);
    expect(acceptedBy.nullable).toBe(true);
    expect(acceptedBy.unique).toBeFalsy();
    expect(acceptedBy.index).toBe(true);
    expect(acceptedBy.deleteRule).toBe('restrict');
  });

  it('keeps the given stack tags per instance', () => {
    const em = orm.em.fork();
    const base = { email: 'a@devmentor.test', tokenHash: 'a'.repeat(64), expiresAt: new Date() };
    const first = em.create(Invitation, { ...base, stackTags: ['react'] });
    const second = em.create(Invitation, { ...base, tokenHash: 'b'.repeat(64), stackTags: ['python', 'ai-agents'] });

    first.stackTags.push('typescript');

    expect(second.stackTags).toEqual(['python', 'ai-agents']);
    expect(first.batch ?? null).toBeNull();
    expect(first.acceptedBy ?? null).toBeNull();
  });

  it('generates the id and timestamps on create and refreshes updatedAt on update', () => {
    const before = Date.now();
    const id = meta.properties.id.onCreate?.({} as Invitation, orm.em);
    const createdAt = meta.properties.createdAt.onCreate?.({} as Invitation, orm.em) as Date;
    const updatedAt = meta.properties.updatedAt.onUpdate?.({} as Invitation, orm.em) as Date;

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(meta.properties.updatedAt.onCreate).toBe(meta.properties.createdAt.onCreate);
  });
});
