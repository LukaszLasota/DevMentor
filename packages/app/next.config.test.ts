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

  it('keeps server class names unminified, so MikroORM resolves entities across server bundles', async () => {
    const config = await loadConfig({});

    expect(config.experimental?.serverMinification).toBe(false);
  });

  it('sends Referrer-Policy: no-referrer for /verify-email, and no-store as well for /invitation/<token>', async () => {
    const config = await loadConfig({});

    expect(await config.headers?.()).toEqual([
      { source: '/verify-email', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      {
        source: '/invitation/:token',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]);
  });

  it('builds the default output unless NEXT_OUTPUT=standalone, so `next start` keeps working', async () => {
    vi.stubEnv('NEXT_OUTPUT', '');

    const config = await loadConfig({});

    expect(config.output).toBeUndefined();
    expect(config.outputFileTracingRoot).toBeUndefined();
  });

  it('builds a standalone server traced from the monorepo root for the Docker image', async () => {
    vi.stubEnv('NEXT_OUTPUT', 'standalone');

    const config = await loadConfig({});

    expect(config.output).toBe('standalone');
    expect(config.outputFileTracingRoot).toBe('/repo');
  });
});
