// CLI-only config (`npm run db -- <command>`); adds the migrator on top of the runtime config.
import { existsSync } from 'node:fs';
import { Migrator } from '@mikro-orm/migrations';
import { createConfig } from './config';

// Env files live at the monorepo root, shared with the app.
const rootEnv = new URL('../../../.env', import.meta.url);

if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default createConfig({
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
  },
});
