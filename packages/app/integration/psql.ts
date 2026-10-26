import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inject } from 'vitest';

const execFileAsync = promisify(execFile);

// The app may not import @devmentor/db, so integration tests read and write the database with psql
// inside the container that `npm run db:migrate` migrated in global-setup.
export async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'exec',
    inject('postgresContainerId'),
    'psql',
    '-U',
    'devmentor',
    '-d',
    'devmentor',
    '-v',
    'ON_ERROR_STOP=1',
    '-tAc',
    sql,
  ]);

  return stdout.trim();
}
