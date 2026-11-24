// `npm run release -- <command>` entry point (used by .github/workflows/release.yml); logic and tests live in ./lib/release.mjs.
import { main } from './lib/release.mjs';

process.exitCode = main();
