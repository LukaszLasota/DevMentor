import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, inject, it } from 'vitest';

const execFileAsync = promisify(execFile);
const baseUrl = inject('baseUrl');

describe('API against a real PostgreSQL', () => {
  it('GET /api/health reports the database as up in the JSON envelope', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { database: 'up' } });
  });

  it('rejects methods the route does not export', async () => {
    const response = await fetch(`${baseUrl}/api/health`, { method: 'POST' });

    expect(response.status).toBe(405);
  });

  it('npm run db:migrate created the migrations table', async () => {
    const { stdout } = await execFileAsync('docker', [
      'exec',
      inject('postgresContainerId'),
      'psql',
      '-U',
      'devmentor',
      '-d',
      'devmentor',
      '-tAc',
      "select to_regclass('public.mikro_orm_migrations') is not null",
    ]);

    expect(stdout.trim()).toBe('t');
  });
});
