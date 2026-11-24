import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { User } from '../auth/user.entity';
import { entities } from '../index';
import {
  INVITATION_BATCH_CHECKS,
  INVITATION_BATCH_NUMBER_UNIQUE,
  INVITATION_BATCH_ONE_OPEN_UNIQUE,
  InvitationBatch,
  InvitationBatchSchema,
  ONE_OPEN_BATCH_INDEX,
} from './invitation-batch.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(InvitationBatch);

afterAll(async () => {
  await orm.close();
});

describe('InvitationBatch entity', () => {
  it('is registered and maps to invitation_batches with a uuid key', () => {
    expect(entities).toContain(InvitationBatchSchema);
    expect(meta.tableName).toBe('invitation_batches');
    expect(meta.primaryKeys).toEqual(['id']);
  });

  it('declares the positive-number and resumed-pair CHECKs', () => {
    expect(meta.checks).toEqual([
      { name: 'invitation_batches_number_check', expression: 'number > 0' },
      { name: 'invitation_batches_resumed_pair_check', expression: '(resumed_at is null) = (resumed_by_id is null)' },
    ]);
    expect(Object.keys(INVITATION_BATCH_CHECKS)).toHaveLength(2);
  });

  it('keeps numbers unique and at most one open batch with a partial expression index', () => {
    expect(meta.uniques).toEqual([
      { name: INVITATION_BATCH_NUMBER_UNIQUE, properties: ['number'] },
      { name: INVITATION_BATCH_ONE_OPEN_UNIQUE, expression: ONE_OPEN_BATCH_INDEX },
    ]);
    expect(INVITATION_BATCH_NUMBER_UNIQUE).toBe('invitation_batches_number_uq');
    expect(ONE_OPEN_BATCH_INDEX).toBe(
      'create unique index "invitation_batches_one_open_uq" on "invitation_batches" ((closed_at is null)) where closed_at is null',
    );
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(Object.keys(meta.properties).sort()).toEqual([
      'closedAt',
      'createdAt',
      'id',
      'number',
      'openedAt',
      'openedBy',
      'resumedAt',
      'resumedBy',
      'updatedAt',
    ]);
    expect(column('id')).toEqual({ field: 'id', type: 'uuid', nullable: false });
    expect(column('number')).toEqual({ field: 'number', type: 'int', nullable: false });
    expect(column('openedAt')).toEqual({ field: 'opened_at', type: 'timestamptz', nullable: false });
    expect(column('closedAt')).toEqual({ field: 'closed_at', type: 'timestamptz', nullable: true });
    expect(column('resumedAt')).toEqual({ field: 'resumed_at', type: 'timestamptz', nullable: true });
    expect(column('createdAt')).toEqual({ field: 'created_at', type: 'timestamptz', nullable: false });
    expect(column('updatedAt')).toEqual({ field: 'updated_at', type: 'timestamptz', nullable: false });
  });

  it('references the opener (required, indexed) and the resumer (nullable) with restricting foreign keys', () => {
    const { openedBy, resumedBy } = meta.properties;

    expect(openedBy.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(openedBy.targetMeta?.class).toBe(User);
    expect(openedBy.fieldNames).toEqual(['opened_by_id']);
    expect(Boolean(openedBy.nullable)).toBe(false);
    expect(openedBy.index).toBe(true);
    expect(openedBy.deleteRule).toBe('restrict');
    expect(resumedBy.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(resumedBy.fieldNames).toEqual(['resumed_by_id']);
    expect(resumedBy.nullable).toBe(true);
    expect(resumedBy.deleteRule).toBe('restrict');
  });

  it('generates the id and timestamps on create and refreshes updatedAt on update', () => {
    const before = Date.now();
    const id = meta.properties.id.onCreate?.({} as InvitationBatch, orm.em);
    const createdAt = meta.properties.createdAt.onCreate?.({} as InvitationBatch, orm.em) as Date;
    const updatedAt = meta.properties.updatedAt.onUpdate?.({} as InvitationBatch, orm.em) as Date;

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
