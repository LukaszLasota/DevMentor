import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { User } from '../auth/user.entity';
import { entities } from '../index';
import { MentorProfile, MentorProfileSchema } from './mentor-profile.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(MentorProfile);

afterAll(async () => {
  await orm.close();
});

describe('MentorProfile entity', () => {
  it('is registered and maps to mentor_profiles with a uuid key', () => {
    expect(entities).toContain(MentorProfileSchema);
    expect(meta.tableName).toBe('mentor_profiles');
    expect(meta.primaryKeys).toEqual(['id']);
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(Object.keys(meta.properties).sort()).toEqual([
      'createdAt',
      'id',
      'initialPublishDueAt',
      'updatedAt',
      'user',
    ]);
    expect(column('id')).toEqual({ field: 'id', type: 'uuid', nullable: false });
    expect(column('initialPublishDueAt')).toEqual({
      field: 'initial_publish_due_at',
      type: 'timestamptz',
      nullable: true,
    });
    expect(column('createdAt')).toEqual({ field: 'created_at', type: 'timestamptz', nullable: false });
    expect(column('updatedAt')).toEqual({ field: 'updated_at', type: 'timestamptz', nullable: false });
  });

  it('belongs to one user through a unique, cascading foreign key', () => {
    const user = meta.properties.user;

    expect(user.kind).toBe(ReferenceKind.ONE_TO_ONE);
    expect(user.owner).toBe(true);
    expect(user.targetMeta?.class).toBe(User);
    expect(user.fieldNames).toEqual(['user_id']);
    expect(user.unique).toBe(true);
    expect(user.deleteRule).toBe('cascade');
    expect(user.nullable).toBeFalsy();
  });

  it('generates the id and timestamps on create and refreshes updatedAt on update', () => {
    const before = Date.now();
    const id = meta.properties.id.onCreate?.({} as MentorProfile, orm.em);
    const createdAt = meta.properties.createdAt.onCreate?.({} as MentorProfile, orm.em) as Date;
    const updatedAt = meta.properties.updatedAt.onUpdate?.({} as MentorProfile, orm.em) as Date;

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(meta.properties.updatedAt.onCreate).toBe(meta.properties.createdAt.onCreate);
  });
});
