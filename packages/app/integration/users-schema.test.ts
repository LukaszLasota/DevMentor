import { afterEach, describe, expect, it } from 'vitest';
import { psql } from './psql';

/** Resolves with psql's error output; fails the test when the statement succeeds. */
async function psqlError(sql: string): Promise<string> {
  try {
    await psql(sql);
  } catch (error) {
    return (error as { stderr: string }).stderr;
  }

  throw new Error(`Expected the statement to fail: ${sql}`);
}

/** Builds an insert with the required columns plus `columns` (column name → SQL literal). */
function insertUser(email: string, columns: Record<string, string> = {}): string {
  const all: Record<string, string> = { id: 'gen_random_uuid()', email: `'${email}'`, created_at: 'now()', updated_at: 'now()', ...columns };

  return `insert into users (${Object.keys(all).join(', ')}) values (${Object.values(all).join(', ')})`;
}

describe('users table (migration against a real PostgreSQL)', () => {
  afterEach(async () => {
    await psql('delete from users');
  });

  it('defaults roles to {mentee} and session_version to 0', async () => {
    await psql(insertUser('default@devmentor.test'));

    expect(await psql("select roles, session_version from users where email = 'default@devmentor.test'")).toBe(
      '{mentee}|0',
    );
  });

  it('accepts any combination of known roles', async () => {
    await psql(insertUser('all@devmentor.test', { roles: "'{mentee,mentor,operator}'" }));
    await psql(insertUser('operator@devmentor.test', { roles: "'{operator}'" }));

    expect(await psql('select count(*) from users')).toBe('2');
  });

  it.each([
    ['empty roles', "'{}'"],
    ['an unknown role', "'{mentee,admin}'"],
    ['a null member', "array['mentee', null]::text[]"],
    ['a two-dimensional array', "'{{mentee}}'"],
  ])('rejects %s with the roles CHECK', async (_case, roles) => {
    expect(await psqlError(insertUser('bad@devmentor.test', { roles }))).toContain('users_roles_check');
  });

  it('rejects null roles', async () => {
    expect(await psqlError(insertUser('null@devmentor.test', { roles: 'null' }))).toContain('not-null constraint');
  });

  it('keeps email unique', async () => {
    await psql(insertUser('same@devmentor.test'));

    expect(await psqlError(insertUser('same@devmentor.test'))).toContain('users_email_unique');
  });

  it('keeps github_id unique, allows many nulls and stores ids above 2^31', async () => {
    await psql(insertUser('a@devmentor.test', { github_id: '5000000000' }));
    await psql(insertUser('b@devmentor.test'));
    await psql(insertUser('c@devmentor.test'));

    expect(await psqlError(insertUser('d@devmentor.test', { github_id: '5000000000' }))).toContain('users_github_id_unique');
    expect(await psql("select github_id from users where email = 'a@devmentor.test'")).toBe('5000000000');
  });
});
