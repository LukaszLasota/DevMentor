import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const existsSync = vi.fn(() => false);

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync,
}));

async function loadCliConfig() {
  vi.resetModules();
  return (await import('./mikro-orm.config')).default;
}

describe('MikroORM CLI config', () => {
  beforeEach(() => {
    existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('builds the config from DATABASE_URL with the migrator and migration paths', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');

    const config = await loadCliConfig();

    expect(config).toMatchObject({
      clientUrl: 'postgres://u:p@localhost:5432/db',
      pool: { min: 0, max: 1 },
      migrations: { path: './dist/migrations', pathTs: './src/migrations' },
    });
    expect(config.extensions).toHaveLength(1);
  });

  it('loads the repo-root .env when it exists', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    existsSync.mockReturnValue(true);
    const loadEnvFile = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);

    await loadCliConfig();

    const [rootEnv] = loadEnvFile.mock.calls[0] as [URL];
    expect(rootEnv.pathname.endsWith('/.env')).toBe(true);
    expect(rootEnv.pathname).not.toContain('/packages/');
  });

  it('fails fast when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', undefined);

    await expect(loadCliConfig()).rejects.toThrow('DATABASE_URL is not set');
  });
});
