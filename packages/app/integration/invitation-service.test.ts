import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { psql } from './psql';

// InvitationService runs in this process against the migrated test database (the in-process
// pattern of account-email-flows.test.ts); psql seeds and reads the rows. Each race runs a few
// rounds so a missing lock shows up as a flaky failure rather than a lucky pass.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';
process.env.APP_URL = 'http://app.devmentor.test';

const core = await import('@devmentor/core');
const DOMAIN = '@invitation-service.test';
const ROUNDS = 5;

let container: Awaited<ReturnType<typeof core.getContainer>>;

beforeAll(async () => {
  container = await core.getContainer();
});

afterAll(async () => {
  await container.cradle.orm.close();
});

afterEach(async () => {
  await psql(`delete from invitations where email like '%${DOMAIN}'`);
  await psql(`delete from users where email like '%${DOMAIN}'`);
});

async function seedVerifiedUser(email: string): Promise<string> {
  const id = randomUUID();
  await psql(
    `insert into users (id, email, email_verified_at, created_at, updated_at) values ('${id}', '${email}', now(), now(), now())`,
  );

  return id;
}

async function createInvitation(email: string): Promise<{ id: string; token: string }> {
  const { invitation, link } = await core.withScope(({ invitationService }) =>
    invitationService.create({ email, tags: ['typescript'], operator: 'integration' }),
  );

  return { id: invitation.id, token: link.split('/invitation/')[1] };
}

function accept(token: string, userId: string) {
  return core.withScope(({ invitationService }) => invitationService.accept(token, { id: userId }));
}

describe('InvitationService against PostgreSQL', () => {
  it('two parallel accepts: one grant, one mentor role, one profile', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const email = `accept-race-${round}${DOMAIN}`;
      const userId = await seedVerifiedUser(email);
      const { token } = await createInvitation(email);

      const results = await Promise.allSettled([accept(token, userId), accept(token, userId)]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0].value).toMatchObject({ roles: ['mentee', 'mentor'], sessionVersion: 1, changed: true });
      expect(rejected[0].reason).toMatchObject({ status: 409, code: 'ALREADY_MENTOR' });
      expect(await psql(`select array_to_string(roles, ','), session_version from users where id = '${userId}'`)).toBe(
        'mentee,mentor|1',
      );
      expect(await psql(`select count(*) from mentor_profiles where user_id = '${userId}'`)).toBe('1');
      expect(
        await psql(
          `select accepted_by_id = '${userId}', publish_due_at = accepted_at + interval '14 days' ` +
            `from invitations where email = '${email}'`,
        ),
      ).toBe('t|t');
    }
  });

  it('accept racing revoke: one winner, nothing partially applied', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const email = `revoke-race-${round}${DOMAIN}`;
      const userId = await seedVerifiedUser(email);
      const { id, token } = await createInvitation(email);

      const [accepted, revoked] = await Promise.allSettled([
        accept(token, userId),
        core.withScope(({ invitationService }) => invitationService.revoke(id)),
      ]);

      expect([accepted.status, revoked.status].sort()).toEqual(['fulfilled', 'rejected']);
      const state = await psql(
        'select accepted_at is not null, revoked_at is not null, ' +
          `(select array_to_string(roles, ',') from users where id = '${userId}'), ` +
          `(select count(*) from mentor_profiles where user_id = '${userId}') from invitations where id = '${id}'`,
      );

      if (accepted.status === 'fulfilled') {
        expect(revoked).toMatchObject({ reason: { status: 409 } });
        expect(state).toBe('t|f|mentee,mentor|1');
      } else {
        expect(accepted.reason).toMatchObject({ status: 404 });
        expect(state).toBe('f|t|mentee|0');
      }
    }
  });

  it('accept racing resend: the old token either wins or is dead, the new link works only if it lost', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const email = `resend-race-${round}${DOMAIN}`;
      const userId = await seedVerifiedUser(email);
      const { id, token } = await createInvitation(email);

      const [accepted, resent] = await Promise.allSettled([
        accept(token, userId),
        core.withScope(({ invitationService }) => invitationService.resend(id)),
      ]);

      if (accepted.status === 'fulfilled') {
        expect(resent).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      } else {
        expect(accepted.reason).toMatchObject({ status: 404 });
        expect(resent.status).toBe('fulfilled');
        const { link } = (resent as PromiseFulfilledResult<{ link: string }>).value;
        await expect(accept(link.split('/invitation/')[1], userId)).resolves.toMatchObject({ changed: true });
      }

      expect(await psql(`select count(*) from mentor_profiles where user_id = '${userId}'`)).toBe('1');
    }
  });

  it('two parallel creates for one email leave one unresolved invitation', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const email = `create-race-${round}${DOMAIN}`;

      const results = await Promise.allSettled([createInvitation(email), createInvitation(email)]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { status: 409, code: 'CONFLICT' },
      });
      expect(await psql(`select count(*) from invitations where email = '${email}'`)).toBe('1');
    }
  });

  it('create racing accept for the same email: never a pending invitation for a current mentor', async () => {
    // Both lock the user row first, so they serialize. Accept first: create re-reads the user
    // under the lock and sees `mentor` (409). Create first: the first invitation is still
    // unresolved, so the partial unique index refuses the second (409 "already invited"). Either
    // way create is refused and accept wins. Create starts 0–9 ms after accept, so some rounds
    // read the user before accept commits and insert after it (the window the lock closes).
    for (let round = 0; round < ROUNDS * 2; round += 1) {
      const email = `create-accept-race-${round}${DOMAIN}`;
      const userId = await seedVerifiedUser(email);
      const { token } = await createInvitation(email);

      const [accepted, created] = await Promise.allSettled([
        accept(token, userId),
        delay(round).then(() => createInvitation(email)),
      ]);

      expect(accepted.status).toBe('fulfilled');
      expect(created).toMatchObject({ status: 'rejected', reason: { status: 409, code: 'CONFLICT' } });
      expect(
        await psql(
          `select count(*) from invitations where email = '${email}' and accepted_at is null and revoked_at is null`,
        ),
      ).toBe('0');
      expect(await psql(`select count(*) from invitations where email = '${email}'`)).toBe('1');
    }
  });

  it('a stored invitation round-trips: lookup, list, and an existing mentor cannot be invited again', async () => {
    const email = `round-trip${DOMAIN}`;
    const userId = await seedVerifiedUser(email);
    const { token } = await createInvitation(` ${email.toUpperCase()} `);

    await expect(core.withScope(({ invitationService }) => invitationService.lookup(token))).resolves.toEqual({
      email,
      stackTags: ['typescript'],
    });
    await accept(token, userId);
    const listed = await core.withScope(({ invitationService }) => invitationService.list());
    expect(listed.find((view) => view.email === email)).toMatchObject({ status: 'accepted' });
    await expect(createInvitation(email)).rejects.toMatchObject({
      status: 409,
      message: 'This email already belongs to a mentor.',
    });
  });
});
