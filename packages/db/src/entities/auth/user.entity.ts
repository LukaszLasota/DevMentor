import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';

/** Every role a user can hold; any combination is allowed (spec: sign-in-github-and-email). */
export const ROLES = ['mentee', 'mentor', 'operator'] as const;

export type Role = (typeof ROLES)[number];

/** Roles of a newly created account. */
export const DEFAULT_ROLES: readonly Role[] = ['mentee'];

/**
 * Database-level guard for `users.roles`: one-dimensional, not empty, no null members, only known
 * roles. Duplicates are normalized by `AccountService`, not here.
 */
export const ROLES_CHECK =
  'array_ndims(roles) = 1 and cardinality(roles) > 0 and array_position(roles, null) is null' +
  ` and roles <@ array[${ROLES.map((role) => `'${role}'`).join(', ')}]::text[]`;

const now = () => new Date();

export const UserSchema = defineEntity({
  name: 'User',
  tableName: 'users',
  checks: [{ name: 'users_roles_check', expression: ROLES_CHECK }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    /** Stored lower-cased and never updated after creation: it is the `OPERATOR_EMAILS` key. */
    email: p.text().unique(),
    /** `operator` here is a cache of `OPERATOR_EMAILS`, not the authority. */
    roles: p.array<Role>().default([...DEFAULT_ROLES]),
    /** Carried as `sv` in the session token; bumped to revoke every session of the user. */
    sessionVersion: p.integer().default(0),
    /**
     * GitHub's numeric user id (bigint column). Mapped to a JS number: GitHub returns it as a JSON
     * number and ids stay far below `Number.MAX_SAFE_INTEGER`, so no precision is lost.
     */
    githubId: p.bigint('number').unique().nullable(),
    githubLogin: p.text().nullable(),
    avatarUrl: p.text().nullable(),
    passwordHash: p.text().nullable().hidden(),
    emailVerifiedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class User extends UserSchema.class {
  // A fresh array per instance: MikroORM assigns a property's `default` by reference, so every new
  // user would share (and mutate) one array.
  override roles: InstanceType<typeof UserSchema.class>['roles'] = [...DEFAULT_ROLES];
}

UserSchema.setClass(User);
