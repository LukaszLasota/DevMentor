import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, afterEach, describe, expect, inject, it } from 'vitest';
import { psql } from './psql';

// The mentor page migration (spec 2026-10-21-mentor-page, step 5) against a real PostgreSQL: the
// three CHECKs, the named slug key, and `down` then `up` on a scratch database of the same server
// (the app keeps using the main one).
const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const run = randomUUID().slice(0, 8);
const SCRATCH_DB = `mentor_page_${run}`;

async function psqlError(sql: string): Promise<string> {
  try {
    await psql(sql);
  } catch (error) {
    return (error as { stderr: string }).stderr;
  }

  throw new Error(`Expected the statement to fail: ${sql}`);
}

async function profileFor(email: string): Promise<string> {
  const userId = randomUUID();
  await psql(`insert into users (id, email, created_at, updated_at) values ('${userId}', '${email}', now(), now())`);
  await psql(
    `insert into mentor_profiles (id, user_id, created_at, updated_at) values (gen_random_uuid(), '${userId}', now(), now())`,
  );

  return userId;
}

const update = (userId: string, set: string) => `update mentor_profiles set ${set} where user_id = '${userId}'`;

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

/** Column names of `mentor_profiles` in the scratch database, sorted. */
async function scratchColumns(): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'exec',
    inject('postgresContainerId'),
    'psql',
    '-U',
    'devmentor',
    '-d',
    SCRATCH_DB,
    '-tAc',
    "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'mentor_profiles'",
  ]);

  return stdout.trim();
}

afterEach(async () => {
  await psql(`delete from users where email like 'mp-%-${run}@devmentor.test'`);
});

afterAll(async () => {
  await psql(`drop database if exists ${SCRATCH_DB}`);
});

describe('mentor_profiles page columns (migration against a real PostgreSQL)', () => {
  it('keeps existing empty profiles valid: tags default to {}, no slug, not published', async () => {
    const userId = await profileFor(`mp-empty-${run}@devmentor.test`);

    expect(
      await psql(
        `select stack_tags, display_name is null, public_work_url is null, bio is null, slug is null, published_at is null
         from mentor_profiles where user_id = '${userId}'`,
      ),
    ).toBe('{}|t|t|t|t|t');
  });

  it.each([
    ['an unknown tag', "stack_tags = '{react,java}'"],
    ['a label instead of a key', "stack_tags = '{TypeScript}'"],
    ['a null member', "stack_tags = array['react', null]::text[]"],
  ])('refuses %s with the stack tags CHECK', async (_case, set) => {
    const userId = await profileFor(`mp-tags-${run}@devmentor.test`);

    expect(await psqlError(update(userId, set))).toContain('mentor_profiles_stack_tags_check');
  });

  it('refuses a bio over 2000 characters and accepts exactly 2000', async () => {
    const userId = await profileFor(`mp-bio-${run}@devmentor.test`);

    await psql(update(userId, `bio = repeat('a', 2000)`));
    expect(await psqlError(update(userId, `bio = repeat('a', 2001)`))).toContain('mentor_profiles_bio_length_check');
  });

  it('refuses a published page without a slug', async () => {
    const userId = await profileFor(`mp-noslug-${run}@devmentor.test`);

    expect(await psqlError(update(userId, 'published_at = now()'))).toContain('mentor_profiles_published_slug_check');
  });

  it('keeps slugs unique under the named key mentor_profiles_slug_key, and slugs fit 60 characters', async () => {
    const first = await profileFor(`mp-slug1-${run}@devmentor.test`);
    const second = await profileFor(`mp-slug2-${run}@devmentor.test`);
    await psql(update(first, `slug = 'same-${run}'`));

    expect(await psqlError(update(second, `slug = 'same-${run}'`))).toContain('mentor_profiles_slug_key');
    expect(await psqlError(update(second, `slug = repeat('a', 61)`))).toContain('value too long');
  });
});

describe('mentor page migration down and up (scratch database)', () => {
  it('removes the page columns and constraints on down and restores them on up', async () => {
    await psql(`create database ${SCRATCH_DB}`);
    await db('migration:up');
    expect(await scratchColumns()).toContain('published_at');

    await db('migration:down');
    expect(await scratchColumns()).toBe('created_at,id,initial_publish_due_at,updated_at,user_id');

    await db('migration:up');
    expect(await scratchColumns()).toBe(
      'bio,created_at,display_name,id,initial_publish_due_at,public_work_url,published_at,slug,stack_tags,updated_at,user_id',
    );
  });
});
