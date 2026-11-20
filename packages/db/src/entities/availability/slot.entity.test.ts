import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { entities } from '../index';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { ACTIVE_SLOT, ACTIVE_SLOT_UNIQUE, Slot, SlotSchema } from './slot.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(Slot);

afterAll(async () => {
  await orm.close();
});

describe('Slot entity', () => {
  it('is registered and maps to slots with a uuid key', () => {
    expect(entities).toContain(SlotSchema);
    expect(meta.tableName).toBe('slots');
    expect(meta.primaryKeys).toEqual(['id']);
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(Object.keys(meta.properties).sort()).toEqual(['createdAt', 'id', 'mentorProfile', 'removedAt', 'startsAt', 'updatedAt']);
    expect(column('startsAt')).toEqual({ field: 'starts_at', type: 'timestamptz', nullable: false });
    expect(column('removedAt')).toEqual({ field: 'removed_at', type: 'timestamptz', nullable: true });
  });

  it('belongs to a mentor profile through a cascading foreign key, with no booking relation', () => {
    const profile = meta.properties.mentorProfile;

    expect(profile.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(profile.targetMeta?.class).toBe(MentorProfile);
    expect(profile.fieldNames).toEqual(['mentor_profile_id']);
    expect(profile.deleteRule).toBe('cascade');
    expect(Object.keys(meta.properties).some((name) => name.toLowerCase().includes('booking'))).toBe(false);
  });

  it('declares the named partial unique index on active starts', () => {
    expect(meta.uniques).toEqual([{ name: ACTIVE_SLOT_UNIQUE, properties: ['mentorProfile', 'startsAt'], where: ACTIVE_SLOT }]);
  });

  it('generates the id and timestamps on create and refreshes updatedAt on update', () => {
    const before = Date.now();

    expect(meta.properties.id.onCreate?.({} as Slot, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect((meta.properties.createdAt.onCreate?.({} as Slot, orm.em) as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((meta.properties.updatedAt.onUpdate?.({} as Slot, orm.em) as Date).getTime()).toBeGreaterThanOrEqual(before);
  });
});
