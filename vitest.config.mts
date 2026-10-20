import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `server-only` throws outside Next's react-server environment; tests run server code directly.
const serverOnlyStub = fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url));
const serverOnlyAlias = { 'server-only': serverOnlyStub };
const jsdomSetup = fileURLToPath(new URL('./vitest.jsdom-setup.ts', import.meta.url));

// Unit tests only (`npm test`, `npm run test:coverage`). Integration tests: vitest.integration.config.mts.
export default defineConfig({
  test: {
    env: { LOG_LEVEL: 'silent' },
    projects: [
      {
        resolve: { alias: serverOnlyAlias },
        test: { name: 'core', root: './packages/core', environment: 'node' },
      },
      {
        resolve: { alias: serverOnlyAlias },
        test: { name: 'db', root: './packages/db', environment: 'node' },
      },
      {
        test: { name: 'ui', root: './packages/ui', environment: 'jsdom', setupFiles: [jsdomSetup] },
      },
      {
        resolve: { alias: { ...serverOnlyAlias, '@': fileURLToPath(new URL('./packages/app/src', import.meta.url)) } },
        test: {
          name: 'app',
          root: './packages/app',
          environment: 'jsdom',
          setupFiles: [jsdomSetup],
          exclude: ['integration/**', 'node_modules/**', '.next/**'],
        },
      },
      {
        test: { name: 'tooling', root: './scripts', environment: 'node' },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'packages/app/next.config.ts', 'scripts/**/*.mjs'],
      exclude: ['**/*.test.{ts,tsx,mjs}', '**/*.d.ts', 'packages/db/src/migrations/**'],
      // AGENTS.md: every feature ships with 100% unit test coverage.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
