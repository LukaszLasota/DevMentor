import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests: real app (`next start`) + throwaway PostgreSQL (testcontainers)
// + agent-browser. Needs Docker and a production build: `npm run test:integration`.
export default defineConfig({
  // Tests that run core code in-process against the test database (rate-limit.test.ts) import
  // `@devmentor/core`, whose `server-only` marker throws outside Next.
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)) } },
  test: {
    name: 'integration',
    root: './packages/app/integration',
    environment: 'node',
    globalSetup: ['./global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
