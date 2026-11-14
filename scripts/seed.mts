// `npm run db:seed` entry point (`tsx --conditions=react-server`); logic and tests live in
// `@devmentor/core/cli` (packages/core/src/cli/seed-cli.ts). The GitHub ids come from the stub itself.
import { runSeedCli } from '@devmentor/core/cli';
import { githubIdFor } from './lib/github-stub.mjs';

process.exitCode = await runSeedCli({
  argv: process.argv.slice(2),
  githubIdFor,
  stdout: console.log,
  stderr: console.error,
});
