import { defineConfig } from 'vitest/config';

// Integration tests: real app (`next start`) + throwaway PostgreSQL (testcontainers)
// + agent-browser. Needs Docker and a production build: `npm run test:integration`.
export default defineConfig({
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
