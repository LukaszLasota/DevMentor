import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { resetInvitationBatches } from './fixtures/invitation-batches';
import { psql } from './psql';

// The invitation-batches migration (spec 2026-11-24-invitation-batches, step 2) against a real
// PostgreSQL: CHECKs, the unique number, at most one open batch, the restricting foreign keys, and
// `down` then `up` on a scratch database of the same server (pattern: mentor-profiles-schema.test.ts).
const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const run = randomUUID().slice(0, 8);
const SCRATCH_DB = `invitation_batches_${run}`;
const OPENER = `ibs-opener-${run}@devmentor.test`;
let openerId: string;

async function psqlError(sql: string): Promise<string> {
  try {
    await psql(sql);
  } catch (error) {
    return (error as { stderr: string }).stderr;
  }

  throw new Error(`Expected the statement to fail: ${sql}`);
}

function insertBatch(number: number, columns: Record<string, string> = {}): string {
  const all: Record<string, string> = {
    id: 'gen_random_uuid()',
    number: String(number),
    opened_by_id: `'${openerId}'`,
    opened_at: 'now()',
    created_at: 'now()',
    updated_at: 'now()',
    ...columns,
  };

  return `insert into invitation_batches (${Object.keys(all).join(', ')}) values (${Object.values(all).join(', ')})`;
}

/** `npm run db -- <args>` against the scratch database. */
async function db(...args: string[]): Promise<string> {
  const url = new URL(inject('databaseUrl'));
  url.pathname = `/${SCRATCH_DB}`;
  const { stdout } = await execFileAsync('npm', ['run', 'db', '--', ...args], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });

  return stdout;
}

async function scratch(sql: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['exec', inject('postgresContainerId'), 'psql', '-U', 'devmentor', '-d', SCRATCH_DB, '-tAc', sql]);

  return stdout.trim();
}

const hasTable = () => scratch("select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'invitation_batches'");
const hasColumn = () =>
  scratch("select count(*) from information_schema.columns where table_name = 'invitations' and column_name = 'invitation_batch_id'");

beforeAll(async () => {
  await resetInvitationBatches();
  openerId = randomUUID();
  await psql(`insert into users (id, email, roles, created_at, updated_at) values ('${openerId}', '${OPENER}', '{mentee,operator}', now(), now())`);
});

beforeEach(async () => {
  await psql(`delete from invitations where email like 'ibs-%-${run}@devmentor.test'`);
  await resetInvitationBatches();
});

afterAll(async () => {
  await psql(`delete from invitations where email like 'ibs-%-${run}@devmentor.test'`);
  await resetInvitationBatches();
  await psql(`delete from users where email = '${OPENER}'`);
  await psql(`drop database if exists ${SCRATCH_DB}`);
});

describe('invitation_batches table (migration against a real PostgreSQL)', () => {
  it('stores a batch with closed, resumed and resumed-by empty', async () => {
    await psql(insertBatch(1));

    expect(await psql('select number, closed_at is null, resumed_at is null, resumed_by_id is null from invitation_batches')).toBe('1|t|t|t');
  });

  it('refuses a non-positive number and a duplicate number (invitation_batches_number_uq)', async () => {
    expect(await psqlError(insertBatch(0))).toContain('invitation_batches_number_check');
    await psql(insertBatch(1, { closed_at: 'now()' }));
    expect(await psqlError(insertBatch(1, { closed_at: 'now()' }))).toContain('invitation_batches_number_uq');
  });

  it('keeps at most one open batch (invitation_batches_one_open_uq) but any number of closed ones', async () => {
    await psql(insertBatch(1, { closed_at: 'now()' }));
    await psql(insertBatch(2, { closed_at: 'now()' }));
    await psql(insertBatch(3));

    expect(await psqlError(insertBatch(4))).toContain('invitation_batches_one_open_uq');
  });

  it('writes resumed_at and resumed_by_id together', async () => {
    expect(await psqlError(insertBatch(1, { resumed_at: 'now()' }))).toContain('invitation_batches_resumed_pair_check');
    expect(await psqlError(insertBatch(1, { resumed_by_id: `'${openerId}'` }))).toContain('invitation_batches_resumed_pair_check');
    await psql(insertBatch(1, { resumed_at: 'now()', resumed_by_id: `'${openerId}'` }));
  });

  it('restricts deleting the opener and a batch that holds invitations; old invitations keep a null batch', async () => {
    await psql(insertBatch(1));
    expect(await psqlError(`delete from users where id = '${openerId}'`)).toContain('invitation_batches_opened_by_id_foreign');

    await psql(
      'insert into invitations (id, email, token_hash, stack_tags, expires_at, invitation_batch_id, created_at, updated_at) ' +
        `values (gen_random_uuid(), 'ibs-one-${run}@devmentor.test', md5(random()::text), '{python}', now() + interval '1 day', (select id from invitation_batches where number = 1), now(), now())`,
    );
    await psql(
      'insert into invitations (id, email, token_hash, stack_tags, expires_at, created_at, updated_at) ' +
        `values (gen_random_uuid(), 'ibs-old-${run}@devmentor.test', md5(random()::text), '{python}', now() + interval '1 day', now(), now())`,
    );
    expect(await psqlError('delete from invitation_batches where number = 1')).toContain('invitations_invitation_batch_id_foreign');
    expect(await psql(`select invitation_batch_id is null from invitations where email = 'ibs-old-${run}@devmentor.test'`)).toBe('t');
  });
});

describe('invitation batches migration down and up (scratch database)', () => {
  it('drops the table and the column on down and restores them on up', async () => {
    await psql(`create database ${SCRATCH_DB}`);
    await db('migration:up');
    expect([await hasTable(), await hasColumn()]).toEqual(['1', '1']);

    await db('migration:down', '--to', 'Migration20261121180000');
    expect([await hasTable(), await hasColumn()]).toEqual(['0', '0']);

    await db('migration:up');
    expect([await hasTable(), await hasColumn()]).toEqual(['1', '1']);
    expect(await scratch("select count(*) from pg_indexes where indexname = 'invitation_batches_one_open_uq'")).toBe('1');
  });
});
