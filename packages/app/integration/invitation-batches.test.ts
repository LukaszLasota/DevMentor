import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { openFreshBatch, resetInvitationBatches } from './fixtures/invitation-batches';
import { psql } from './psql';

// Invitation batches against PostgreSQL (spec 2026-11-24-invitation-batches, Tests → Integration): the
// 20th-invitation race (the loser is BATCH_FULL, never NO_OPEN_BATCH), the open-batch race, the mail
// failure that saves nothing, and `resend` refused while batch 1 is decided with 4 publishers (rule 6).
// The services run in this process (pattern of invitation-service.test.ts); each race runs several
// rounds with a 0–9 ms stagger (lesson 2026-11-14). Batch state is global: reset before and after.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';
process.env.APP_URL = 'http://app.devmentor.test';

const core = await import('@devmentor/core');
const DOMAIN = '@invitation-batches.test';
const ROUNDS = 5;
const STOPPED = 'Invitations are stopped: fewer than 5 of the first 20 published a slot within two weeks. Interview the decliners first.';

let container: Awaited<ReturnType<typeof core.getContainer>>;
let operatorId: string;

async function cleanup(): Promise<void> {
  const people = `select id from users where email like '%${DOMAIN}'`;
  await psql(`delete from invitations where email like '%${DOMAIN}'`);
  await resetInvitationBatches();
  await psql(`delete from slots where mentor_profile_id in (select id from mentor_profiles where user_id in (${people}))`);
  await psql(`delete from mentor_profiles where user_id in (${people})`);
  await psql(`delete from users where email like '%${DOMAIN}'`);
}

beforeAll(async () => {
  await cleanup();
  container = await core.getContainer();
  operatorId = randomUUID();
  await psql(`insert into users (id, email, roles, created_at, updated_at) values ('${operatorId}', 'operator${DOMAIN}', '{mentee,operator}', now(), now())`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanup();
  await container.cradle.orm.close();
});

const operator = () => ({ id: operatorId, roles: ['mentee', 'operator'] as ['mentee', 'operator'] });

function create(email: string) {
  return core.withScope(({ invitationService }) =>
    invitationService.create({ email, tags: ['python'] }, { kind: 'cli', operator: 'it-batches' }),
  );
}

function openBatch() {
  return core.withScope(({ invitationBatchService }) => invitationBatchService.open(operator()));
}

/** `count` invitations by SQL into the open batch (fast setup for the 20th-invitation race). */
async function fillOpenBatch(prefix: string, count: number): Promise<void> {
  await psql(
    'insert into invitations (id, email, token_hash, stack_tags, expires_at, invitation_batch_id, created_at, updated_at) ' +
      `select gen_random_uuid(), '${prefix}-' || g || '${DOMAIN}', md5(random()::text || g), '{python}', now() + interval '14 days', ` +
      `(select id from invitation_batches where closed_at is null), now(), now() from generate_series(1, ${count}) g`,
  );
}

describe('invitation batches against PostgreSQL', () => {
  it('the 20th-invitation race: one wins and closes the batch, the loser gets BATCH_FULL; the batch ends with 20', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await resetInvitationBatches();
      const number = await openFreshBatch();
      await fillOpenBatch(`fill-${round}`, 19);

      const results = await Promise.allSettled([
        create(`race-a-${round}${DOMAIN}`),
        delay(round % 10).then(() => create(`race-b-${round}${DOMAIN}`)),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0]).toMatchObject({ value: { batchNumber: number, sent: 20 } });
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ status: 409, code: 'BATCH_FULL', message: 'This batch is full; open a new batch.' });
      expect(
        await psql(`select count(*) from invitations i join invitation_batches b on b.id = i.invitation_batch_id where b.number = ${number}`),
      ).toBe('20');
      expect(await psql(`select closed_at is not null from invitation_batches where number = ${number}`)).toBe('t');
    }
  });

  it('a 21st invitation is refused with BATCH_FULL and nothing is written', async () => {
    await resetInvitationBatches();
    await openFreshBatch();
    await fillOpenBatch('full', 19);
    await create(`twentieth${DOMAIN}`);

    await expect(create(`twenty-first${DOMAIN}`)).rejects.toMatchObject({ code: 'BATCH_FULL' });
    expect(await psql(`select count(*) from invitations where email = 'twenty-first${DOMAIN}'`)).toBe('0');
  });

  it('with no batch ever opened, create answers NO_OPEN_BATCH', async () => {
    await resetInvitationBatches();

    await expect(create(`no-batch${DOMAIN}`)).rejects.toMatchObject({ status: 409, code: 'NO_OPEN_BATCH' });
  });

  it('the open-batch race: exactly one batch is created, the loser gets BATCH_ALREADY_OPEN', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await resetInvitationBatches();

      const results = await Promise.allSettled([openBatch(), delay(round % 10).then(() => openBatch())]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(results.find((result) => result.status === 'fulfilled')).toMatchObject({ value: { number: 1 } });
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'BATCH_ALREADY_OPEN' } });
      expect(await psql('select count(*) from invitation_batches')).toBe('1');
    }
  });

  it('a mail failure saves nothing, leaves the count unchanged, and the same address can be invited again', async () => {
    await resetInvitationBatches();
    const number = await openFreshBatch();
    const email = `mail-down${DOMAIN}`;
    vi.spyOn(container.cradle.mailSender, 'send').mockRejectedValueOnce(new Error('provider down'));

    await expect(create(email)).rejects.toMatchObject({
      status: 503,
      code: 'INVITATION_MAIL_FAILED',
      message: 'The invitation email could not be sent. Nothing was saved; try again.',
    });
    expect(await psql(`select count(*) from invitations where email = '${email}'`)).toBe('0');

    await expect(create(email)).resolves.toMatchObject({ batchNumber: number, sent: 1 });
    expect(await psql(`select count(*) from invitations where email = '${email}'`)).toBe('1');
  });

  it('batch 1 decided with 4 publishers: resend, create and open are refused, the row and the stop are unchanged', async () => {
    await resetInvitationBatches();
    await openFreshBatch();
    await psql('update invitation_batches set closed_at = now() where number = 1');
    const batch1 = "(select id from invitation_batches where number = 1)";

    for (let index = 0; index < 4; index += 1) {
      const userId = randomUUID();
      const profileId = randomUUID();
      await psql(
        [
          `insert into users (id, email, roles, created_at, updated_at) values ('${userId}', 'pub-${index}${DOMAIN}', '{mentee,mentor}', now(), now())`,
          `insert into mentor_profiles (id, user_id, created_at, updated_at) values ('${profileId}', '${userId}', now(), now())`,
          'insert into invitations (id, email, token_hash, stack_tags, expires_at, accepted_at, accepted_by_id, publish_due_at, invitation_batch_id, created_at, updated_at) ' +
            `values (gen_random_uuid(), 'pub-${index}${DOMAIN}', md5(random()::text), '{python}', now() - interval '19 days', now() - interval '20 days', '${userId}', now() - interval '6 days', ${batch1}, now() - interval '21 days', now())`,
          `insert into slots (id, mentor_profile_id, starts_at, created_at, updated_at) values (gen_random_uuid(), '${profileId}', now() + interval '1 day', now() - interval '19 days', now())`,
        ].join('; '),
      );
    }

    await psql(
      'insert into invitations (id, email, token_hash, stack_tags, expires_at, invitation_batch_id, created_at, updated_at) ' +
        `select gen_random_uuid(), 'expired-' || g || '${DOMAIN}', md5(random()::text || g), '{python}', now() - interval '1 day', ${batch1}, now() - interval '21 days', now() ` +
        'from generate_series(1, 16) g',
    );
    const expiredId = await psql(`select id from invitations where email = 'expired-1${DOMAIN}'`);
    const before = await psql(`select token_hash, expires_at from invitations where id = '${expiredId}'`);

    await expect(core.withScope(({ invitationService }) => invitationService.resend(expiredId))).rejects.toMatchObject({
      status: 409,
      code: 'INVITATIONS_STOPPED',
      message: STOPPED,
    });
    expect(await psql(`select token_hash, expires_at from invitations where id = '${expiredId}'`)).toBe(before);

    await psql(`insert into invitation_batches (id, number, opened_by_id, opened_at, created_at, updated_at) values (gen_random_uuid(), 2, '${operatorId}', now(), now(), now())`);
    await expect(create(`after-stop${DOMAIN}`)).rejects.toMatchObject({ code: 'INVITATIONS_STOPPED' });
    await psql('update invitation_batches set closed_at = now() where number = 2');
    await expect(openBatch()).rejects.toMatchObject({ code: 'INVITATIONS_STOPPED' });

    const overview = await core.withScope(({ invitationBatchService }) => invitationBatchService.overview(operator()));
    expect(overview).toMatchObject({ stopped: true, canOpen: false });
    expect(overview.batches.find((batch) => batch.number === 1)).toMatchObject({ state: 'stopped', counts: { sent: 20, accepted: 4, published: 4 } });
  });
});
