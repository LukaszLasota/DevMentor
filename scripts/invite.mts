// `npm run invite -- …` entry point (`tsx --conditions=react-server`); logic and tests live in
// `@devmentor/core/cli` (packages/core/src/cli/invite-cli.ts).
import { runInviteCli } from '@devmentor/core/cli';

process.exitCode = await runInviteCli({ argv: process.argv.slice(2), stdout: console.log, stderr: console.error });
