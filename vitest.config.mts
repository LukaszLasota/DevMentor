import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `server-only` throws outside Next's react-server environment; tests run server code directly.
const serverOnlyStub = fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { 'server-only': serverOnlyStub } },
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          env: { LOG_LEVEL: 'silent' },
        },
      },
      {
        test: {
          name: 'ui',
          root: './packages/ui',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
