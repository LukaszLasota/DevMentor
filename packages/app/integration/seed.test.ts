import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { githubIdFor } from '../../../scripts/lib/github-stub.mjs';
import { psql } from './psql';

// `npm run db:seed` logic (`seedDemoAccounts`) in this process against the migrated test database,
// then password sign-in over HTTP against the production server.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';

const core = await import('@devmentor/core');
const { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemoAccounts } = await import('@devmentor/core/cli');
const baseUrl = inject('baseUrl');
const DEMO_EMAILS = DEMO_ACCOUNTS.map(({ email }) => `'${email}'`).join(', ');

let container: Awaited<ReturnType<typeof core.getContainer>>;

const seed = () => core.withScope((cradle) => seedDemoAccounts(cradle, githubIdFor));

function signIn(email: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-devmentor-request': '1' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
}

async function cleanUp(): Promise<void> {
  await psql(`delete from users where email in (${DEMO_EMAILS})`);
  await psql('delete from auth_rate_limits');
}

beforeAll(async () => {
  await cleanUp();
  container = await core.getContainer();
});

afterAll(async () => {
  await container.cradle.orm.close();
  await cleanUp();
});

describe('demo account seed', () => {
  it('creates the demo accounts; the password works where the seed set one', async () => {
    const results = await seed();

    expect(results.map(({ status }) => status)).toEqual(['created', 'created', 'created', 'created']);
    expect(await psql(`select github_id from users where email = 'mock-mentee@devmentor.test'`)).toBe(
      String(githubIdFor('mock-mentee')),
    );

    const mentee = await signIn('mock-mentee@devmentor.test');
    expect(mentee.status).toBe(200);
    expect((await mentee.json()).data.user).toMatchObject({ email: 'mock-mentee@devmentor.test', emailVerified: true });

    expect((await signIn('mock-github-only@devmentor.test')).status).toBe(401);
    expect((await signIn('mock-pending@example.com')).status).toBe(401);
  });

  it('changes nothing when run again', async () => {
    const snapshot = () => psql(`select email, password_hash, session_version from users where email in (${DEMO_EMAILS}) order by email`);
    const count = () => psql('select count(*) from users');
    const [rowsBefore, countBefore] = [await snapshot(), await count()];

    const results = await seed();

    expect(results.map(({ status }) => status)).toEqual(['unchanged', 'unchanged', 'unchanged', 'unchanged']);
    expect(await snapshot()).toBe(rowsBefore);
    expect(await count()).toBe(countBefore);
  });
});
