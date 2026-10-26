import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { DEFAULT_ROLES, ROLES, ROLES_CHECK, User, UserSchema } from './user.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(User);

afterAll(async () => {
  await orm.close();
});

describe('User entity', () => {
  it('maps to the users table with the roles CHECK constraint', () => {
    expect(meta.tableName).toBe('users');
    expect(meta.checks).toEqual([{ name: 'users_roles_check', expression: ROLES_CHECK }]);
    expect(ROLES_CHECK).toBe(
      'array_ndims(roles) = 1 and cardinality(roles) > 0 and array_position(roles, null) is null' +
        " and roles <@ array['mentee', 'mentor', 'operator']::text[]",
    );
  });

  it('defines the roles, with mentee as the default', () => {
    expect(ROLES).toEqual(['mentee', 'mentor', 'operator']);
    expect(DEFAULT_ROLES).toEqual(['mentee']);
  });

  it('maps every column with its type, nullability and uniqueness', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable), unique: Boolean(prop.unique) };
    };

    expect(meta.primaryKeys).toEqual(['id']);
    expect(column('id')).toEqual({ field: 'id', type: 'uuid', nullable: false, unique: false });
    expect(column('email')).toEqual({ field: 'email', type: 'text', nullable: false, unique: true });
    expect(column('roles')).toEqual({ field: 'roles', type: 'text[]', nullable: false, unique: false });
    expect(column('sessionVersion')).toEqual({ field: 'session_version', type: 'int', nullable: false, unique: false });
    expect(column('githubId')).toEqual({ field: 'github_id', type: 'bigint', nullable: true, unique: true });
    expect(column('githubLogin')).toEqual({ field: 'github_login', type: 'text', nullable: true, unique: false });
    expect(column('avatarUrl')).toEqual({ field: 'avatar_url', type: 'text', nullable: true, unique: false });
    expect(column('passwordHash')).toEqual({ field: 'password_hash', type: 'text', nullable: true, unique: false });
    expect(column('emailVerifiedAt')).toEqual({ field: 'email_verified_at', type: 'timestamptz', nullable: true, unique: false });
    expect(column('createdAt')).toEqual({ field: 'created_at', type: 'timestamptz', nullable: false, unique: false });
    expect(column('updatedAt')).toEqual({ field: 'updated_at', type: 'timestamptz', nullable: false, unique: false });
  });

  it('applies the defaults to a new user and keeps them per instance', () => {
    const em = orm.em.fork();
    const first = em.create(User, { email: 'first@devmentor.test' });
    const second = em.create(User, { email: 'second@devmentor.test', roles: ['mentee', 'operator'] });

    first.roles.push('mentor');

    expect(em.create(User, { email: 'third@devmentor.test' }).roles).toEqual(['mentee']);
    expect(second.roles).toEqual(['mentee', 'operator']);
    expect(first.sessionVersion).toBe(0);
    expect(first.githubId ?? null).toBeNull();
  });

  it('generates the id and timestamps on create and refreshes updatedAt on update', () => {
    const id = meta.properties.id.onCreate?.({} as User, orm.em);
    const createdAt = meta.properties.createdAt.onCreate?.({} as User, orm.em);
    const updatedAt = meta.properties.updatedAt.onUpdate?.({} as User, orm.em);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdAt).toBeInstanceOf(Date);
    expect(updatedAt).toBeInstanceOf(Date);
    expect(meta.properties.updatedAt.onCreate).toBe(meta.properties.createdAt.onCreate);
  });

  it('never serializes the password hash', () => {
    const user = orm.em.fork().create(User, { email: 'hidden@devmentor.test', passwordHash: 'scrypt$secret' });

    expect(JSON.stringify(user)).not.toContain('scrypt$secret');
    expect(UserSchema.meta.className).toBe('User');
  });
});
