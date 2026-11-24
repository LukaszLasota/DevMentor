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

function insertToken(userId: string, tokenHash: string): string {
  return (
    'insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at, updated_at) ' +
    `values (gen_random_uuid(), '${userId}', '${tokenHash}', now() + interval '24 hours', now(), now())`
  );
}

describe('email_verification_tokens table (migration against a real PostgreSQL)', () => {
  afterEach(async () => {
    // Batches opened by other files reference their opener (`on delete restrict`).
    await resetInvitationBatches();
    await psql('delete from users');
  });

  it('stores a token with used_at null by default', async () => {
    const userId = await insertUser('token@devmentor.test');

    await psql(insertToken(userId, 'a'.repeat(64)));

    expect(await psql(`select used_at is null, user_id = '${userId}' from email_verification_tokens`)).toBe('t|t');
  });

  it('keeps token_hash unique, also across users', async () => {
    const first = await insertUser('first@devmentor.test');
    const second = await insertUser('second@devmentor.test');
    await psql(insertToken(first, 'b'.repeat(64)));

    expect(await psqlError(insertToken(second, 'b'.repeat(64)))).toContain('email_verification_tokens_token_hash_unique');
  });

  it('refuses a token for an unknown user', async () => {
    expect(await psqlError(insertToken('00000000-0000-4000-8000-000000000000', 'c'.repeat(64)))).toContain(
      'email_verification_tokens_user_id_foreign',
    );
  });

  it('deletes the tokens with their user (on delete cascade) and keeps other users’ tokens', async () => {
    const gone = await insertUser('gone@devmentor.test');
    const kept = await insertUser('kept@devmentor.test');
    await psql(insertToken(gone, 'd'.repeat(64)));
    await psql(insertToken(gone, 'e'.repeat(64)));
    await psql(insertToken(kept, 'f'.repeat(64)));

    await psql(`delete from users where id = '${gone}'`);

    expect(await psql('select count(*) from email_verification_tokens')).toBe('1');
    expect(await psql(`select count(*) from email_verification_tokens where user_id = '${kept}'`)).toBe('1');
  });
});
