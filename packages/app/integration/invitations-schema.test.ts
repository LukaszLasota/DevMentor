import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { resetInvitationBatches } from './fixtures/invitation-batches';
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

async function insertUser(email: string): Promise<string> {
  const id = randomUUID();
  await psql(`insert into users (id, email, created_at, updated_at) values ('${id}', '${email}', now(), now())`);

  return id;
}

/** Builds an invitation insert with the required columns plus `columns` (column name → SQL literal). */
function insertInvitation(email: string, columns: Record<string, string> = {}): string {
  const all: Record<string, string> = {
    id: 'gen_random_uuid()',
    email: `'${email}'`,
    token_hash: `'${randomUUID()}'`,
    stack_tags: "'{typescript,react}'",
    expires_at: "now() + interval '14 days'",
    created_at: 'now()',
    updated_at: 'now()',
    ...columns,
  };

  return `insert into invitations (${Object.keys(all).join(', ')}) values (${Object.values(all).join(', ')})`;
}

function insertProfile(userId: string): string {
  return (
    'insert into mentor_profiles (id, user_id, created_at, updated_at) ' +
    `values (gen_random_uuid(), '${userId}', now(), now())`
  );
}

describe('invitations table (migration against a real PostgreSQL)', () => {
  afterEach(async () => {
    await psql('delete from invitations');
    // Batches opened by other files reference their opener (`on delete restrict`).
    await resetInvitationBatches();
    await psql('delete from users');
  });

  it('stores an invitation with every beachhead tag and the nullable columns empty', async () => {
    await psql(insertInvitation('all@devmentor.test', { stack_tags: "'{typescript,react,python,ai-agents}'" }));

    expect(
      await psql(
        'select stack_tags, batch is null, accepted_at is null, accepted_by_id is null, publish_due_at is null, ' +
          'revoked_at is null from invitations',
      ),
    ).toBe('{typescript,react,python,ai-agents}|t|t|t|t|t');
  });

  it.each([
    ['empty tags', "'{}'"],
    ['an unknown tag', "'{react,java}'"],
    ['a label instead of a slug', "'{TypeScript}'"],
    ['a null member', "array['react', null]::text[]"],
    ['a two-dimensional array', "'{{react}}'"],
  ])('rejects %s with the stack tags CHECK', async (_case, tags) => {
    expect(await psqlError(insertInvitation('bad@devmentor.test', { stack_tags: tags }))).toContain(
      'invitations_stack_tags_check',
    );
  });

  it('rejects null stack tags', async () => {
    expect(await psqlError(insertInvitation('null@devmentor.test', { stack_tags: 'null' }))).toContain(
      'not-null constraint',
    );
  });

  it('writes accepted_at and accepted_by_id together (accepted-pair CHECK)', async () => {
    const userId = await insertUser('mentor@devmentor.test');

    expect(await psqlError(insertInvitation('a@devmentor.test', { accepted_at: 'now()' }))).toContain(
      'invitations_accepted_pair_check',
    );
    expect(await psqlError(insertInvitation('b@devmentor.test', { accepted_by_id: `'${userId}'` }))).toContain(
      'invitations_accepted_pair_check',
    );

    await psql(insertInvitation('mentor@devmentor.test', { accepted_at: 'now()', accepted_by_id: `'${userId}'` }));

    expect(await psql('select count(*) from invitations')).toBe('1');
  });

  it('keeps token_hash unique', async () => {
    await psql(insertInvitation('first@devmentor.test', { token_hash: `'${'a'.repeat(64)}'` }));

    expect(
      await psqlError(insertInvitation('second@devmentor.test', { token_hash: `'${'a'.repeat(64)}'` })),
    ).toContain('invitations_token_hash_unique');
  });

  it('refuses a second unresolved invitation for one email, also when the first has expired', async () => {
    await psql(insertInvitation('twice@devmentor.test', { expires_at: "now() - interval '1 day'" }));

    expect(await psqlError(insertInvitation('twice@devmentor.test'))).toContain('invitations_email_unresolved_unique');
  });

  it('allows a new unresolved invitation next to accepted and revoked ones for the same email', async () => {
    const userId = await insertUser('again@devmentor.test');
    await psql(insertInvitation('again@devmentor.test', { accepted_at: 'now()', accepted_by_id: `'${userId}'` }));
    await psql(insertInvitation('again@devmentor.test', { revoked_at: 'now()' }));
    await psql(insertInvitation('again@devmentor.test', { revoked_at: 'now()' }));
    await psql(insertInvitation('again@devmentor.test'));

    expect(await psql("select count(*) from invitations where email = 'again@devmentor.test'")).toBe('4');
  });

  it('allows one user to accept several invitations (accepted_by_id is not unique)', async () => {
    const userId = await insertUser('repeat@devmentor.test');
    const accepted = { accepted_at: 'now()', accepted_by_id: `'${userId}'` };
    await psql(insertInvitation('repeat@devmentor.test', accepted));
    await psql(insertInvitation('repeat@devmentor.test', accepted));

    expect(await psql(`select count(*) from invitations where accepted_by_id = '${userId}'`)).toBe('2');
  });

  it('refuses an unknown accepting user and keeps the user while an accepted invitation points to them', async () => {
    const userId = await insertUser('kept@devmentor.test');
    await psql(insertInvitation('kept@devmentor.test', { accepted_at: 'now()', accepted_by_id: `'${userId}'` }));

    expect(
      await psqlError(
        insertInvitation('ghost@devmentor.test', {
          accepted_at: 'now()',
          accepted_by_id: "'00000000-0000-4000-8000-000000000000'",
        }),
      ),
    ).toContain('invitations_accepted_by_id_foreign');
    expect(await psqlError(`delete from users where id = '${userId}'`)).toContain('invitations_accepted_by_id_foreign');
  });
});

describe('mentor_profiles table (migration against a real PostgreSQL)', () => {
  afterEach(async () => {
    await resetInvitationBatches();
    await psql('delete from users');
  });

  it('stores a profile with initial_publish_due_at null by default', async () => {
    const userId = await insertUser('profile@devmentor.test');

    await psql(insertProfile(userId));

    expect(await psql(`select initial_publish_due_at is null from mentor_profiles where user_id = '${userId}'`)).toBe(
      't',
    );
  });

  it('keeps one profile per user', async () => {
    const userId = await insertUser('one@devmentor.test');
    await psql(insertProfile(userId));

    expect(await psqlError(insertProfile(userId))).toContain('mentor_profiles_user_id_unique');
  });

  it('refuses a profile for an unknown user', async () => {
    expect(await psqlError(insertProfile('00000000-0000-4000-8000-000000000000'))).toContain(
      'mentor_profiles_user_id_foreign',
    );
  });

  it('deletes the profile with its user (on delete cascade) and keeps other profiles', async () => {
    const gone = await insertUser('gone@devmentor.test');
    const kept = await insertUser('kept@devmentor.test');
    await psql(insertProfile(gone));
    await psql(insertProfile(kept));

    await psql(`delete from users where id = '${gone}'`);

    expect(await psql('select count(*) from mentor_profiles')).toBe('1');
    expect(await psql(`select count(*) from mentor_profiles where user_id = '${kept}'`)).toBe('1');
  });
});
