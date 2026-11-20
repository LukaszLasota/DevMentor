import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { User } from '../auth/user.entity';
import { entities } from '../index';
import {
  BIO_LENGTH_CHECK,
  BIO_MAX_LENGTH,
  MENTOR_PROFILE_SLUG_KEY,
  MENTOR_STACK_TAGS_CHECK,
  MentorProfile,
  MentorProfileSchema,
  PRICE_25_POSITIVE_CHECK,
  PRICE_50_POSITIVE_CHECK,
  PUBLISHED_SLUG_CHECK,
} from './mentor-profile.entity';

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
      'bio',
      'createdAt',
      'displayName',
      'id',
      'initialPublishDueAt',
      'lastPublishedAvailabilityAt',
      'price25Cents',
      'price50Cents',
      'publicWorkUrl',
      'publishedAt',
      'slug',
      'stackTags',
      'updatedAt',
      'user',
    ]);
    expect(column('displayName')).toEqual({ field: 'display_name', type: 'varchar(80)', nullable: true });
    expect(column('publicWorkUrl')).toEqual({ field: 'public_work_url', type: 'text', nullable: true });
    expect(column('bio')).toEqual({ field: 'bio', type: 'text', nullable: true });
    expect(column('stackTags')).toEqual({ field: 'stack_tags', type: 'text[]', nullable: false });
    expect(column('slug')).toEqual({ field: 'slug', type: 'varchar(60)', nullable: true });
    expect(column('publishedAt')).toEqual({ field: 'published_at', type: 'timestamptz', nullable: true });
    expect(column('price25Cents')).toEqual({ field: 'price_25_cents', type: 'int', nullable: true });
    expect(column('price50Cents')).toEqual({ field: 'price_50_cents', type: 'int', nullable: true });
    expect(column('lastPublishedAvailabilityAt')).toEqual({
      field: 'last_published_availability_at',
      type: 'timestamptz',
      nullable: true,
    });
    expect(column('id')).toEqual({ field: 'id', type: 'uuid', nullable: false });
    expect(column('initialPublishDueAt')).toEqual({
      field: 'initial_publish_due_at',
      type: 'timestamptz',
      nullable: true,
    });
    expect(column('createdAt')).toEqual({ field: 'created_at', type: 'timestamptz', nullable: false });
    expect(column('updatedAt')).toEqual({ field: 'updated_at', type: 'timestamptz', nullable: false });
  });

  it('declares the named slug key and the three CHECKs', () => {
    expect(meta.uniques).toEqual([{ name: MENTOR_PROFILE_SLUG_KEY, properties: ['slug'] }]);
    expect(meta.checks.map((check) => [check.name, check.expression])).toEqual([
      ['mentor_profiles_stack_tags_check', MENTOR_STACK_TAGS_CHECK],
      ['mentor_profiles_bio_length_check', BIO_LENGTH_CHECK],
      ['mentor_profiles_published_slug_check', PUBLISHED_SLUG_CHECK],
      ['mentor_profiles_price_25_cents_check', PRICE_25_POSITIVE_CHECK],
      ['mentor_profiles_price_50_cents_check', PRICE_50_POSITIVE_CHECK],
    ]);
    expect(MENTOR_STACK_TAGS_CHECK).toBe(
      "array_position(stack_tags, null) is null and stack_tags <@ array['typescript', 'react', 'python', 'ai-agents']::text[]",
    );
    expect(BIO_LENGTH_CHECK).toBe(`bio is null or char_length(bio) <= ${BIO_MAX_LENGTH}`);
  });

  it('gives every new profile its own empty tag list', () => {
    const first = new MentorProfile();
    const second = new MentorProfile();

    first.stackTags.push('react');
    expect(second.stackTags).toEqual([]);
    expect(meta.properties.stackTags.default).toEqual([]);
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
