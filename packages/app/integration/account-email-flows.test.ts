import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import type { MailMessage } from '@devmentor/core';
import { psql } from './psql';

// AccountService's email flows run in this process against the migrated test database (the
// in-process pattern of rate-limit.test.ts); psql seeds and reads the rows. `getEnv` reads
// process.env on first use.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';
process.env.APP_URL = 'http://app.devmentor.test';

const core = await import('@devmentor/core');
const PASSWORD = 'correct horse battery';

let container: Awaited<ReturnType<typeof core.getContainer>>;
const sent: MailMessage[] = [];

beforeAll(async () => {
  container = await core.getContainer();
  // The mailer is a process singleton: capture the messages instead of writing them to the log.
  vi.spyOn(container.cradle.mailSender, 'send').mockImplementation(async (message) => {
    sent.push(message);
  });
});

afterAll(async () => {
  await container.cradle.orm.close();
});

afterEach(async () => {
  sent.length = 0;
  await psql("delete from users where email like '%@email-flows.test'");
  await psql('delete from auth_rate_limits');
});

function tokenFrom(message: MailMessage): string {
  const link = new URL(/https?:\/\/\S+/.exec(message.text)![0]);

  return new URLSearchParams(link.hash.slice(1)).get('token')!;
}

async function seedPendingUser(email: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await psql(`insert into users (id, email, created_at, updated_at) values ('${userId}', '${email}', now(), now())`);
  await psql(
    'insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at, updated_at) ' +
      `values (gen_random_uuid(), '${userId}', '${tokenHash}', now() + interval '24 hours', now(), now())`,
  );

  return { userId, token };
}

describe('AccountService email flows against PostgreSQL', () => {
  it('two parallel uses of one link: exactly one sets the password', async () => {
    const { userId, token } = await seedPendingUser('race@email-flows.test');

    const results = await Promise.allSettled(
      ['first password!!', 'second password!'].map((password) =>
        core.withScope(({ accountService }) => accountService.setPasswordFromLink({ token, password }, null)),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === 'rejected');
    expect(rejected.reason).toMatchObject({ status: 400, code: 'VERIFICATION_LINK_INVALID' });
    expect(
      await psql(
        `select password_hash is not null, email_verified_at is not null, session_version from users where id = '${userId}'`,
      ),
    ).toBe('t|t|1');
    expect(await psql(`select count(*) from email_verification_tokens where user_id = '${userId}' and used_at is not null`)).toBe(
      '1',
    );
  });

  it('register → resend retires the first link → the new link sets the password → password sign-in works', async () => {
    const email = 'ada@email-flows.test';
    await core.withScope(({ accountService }) => accountService.startRegistration({ email }, { ip: null }));
    await core.withScope(({ accountService }) => accountService.resendVerification({ email }, { ip: null }));
    const [first, second] = sent.map(tokenFrom);

    await expect(
      core.withScope(({ accountService }) => accountService.setPasswordFromLink({ token: first, password: PASSWORD }, null)),
    ).rejects.toMatchObject({ code: 'VERIFICATION_LINK_INVALID' });
    const { user, redirectTo } = await core.withScope(({ accountService }) =>
      accountService.setPasswordFromLink({ token: second, password: PASSWORD }, null),
    );

    expect(user).toMatchObject({ email, sessionVersion: 1 });
    expect(redirectTo).toBe('/mentors');
    const signedIn = await core.withScope(({ accountService }) =>
      accountService.verifyPassword({ email, password: PASSWORD }, { ip: null }),
    );
    expect(signedIn.id).toBe(user.id);
    await expect(
      core.withScope(({ accountService }) => accountService.verifyPassword({ email, password: 'wrong password' }, { ip: null })),
    ).rejects.toMatchObject({ status: 401, message: 'Invalid email or password.' });
  });
});
