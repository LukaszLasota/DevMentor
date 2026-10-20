// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadEnvConfig = vi.fn();
const updateInitialEnv = vi.fn();

vi.mock('@next/env', () => ({ loadEnvConfig, updateInitialEnv }));

async function loadConfig(parsedEnv: Record<string, string> | undefined) {
  vi.resetModules();
  loadEnvConfig.mockReset().mockReturnValue({ parsedEnv });
  updateInitialEnv.mockReset();
  vi.spyOn(process, 'cwd').mockReturnValue('/repo/packages/app');

  return (await import('./next.config')).default;
}

describe('next.config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('force-loads the repo-root .env and keeps it across Next env reloads', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await loadConfig({ DATABASE_URL: 'postgres://root-env' });

    expect(loadEnvConfig).toHaveBeenCalledWith('/repo', true, console, true);
    expect(updateInitialEnv).toHaveBeenCalledWith({ DATABASE_URL: 'postgres://root-env' });
  });

  it('loads production env files in production and tolerates a missing root .env', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await loadConfig(undefined);

    expect(loadEnvConfig).toHaveBeenCalledWith('/repo', false, console, true);
    expect(updateInitialEnv).toHaveBeenCalledWith({});
  });

  it('keeps MikroORM out of the server bundle', async () => {
    const config = await loadConfig({});

    expect(config.serverExternalPackages).toEqual(expect.arrayContaining(['@mikro-orm/postgresql', '@mikro-orm/sql']));
  });
});
