// `npm run check:tokens` entry point; logic and tests live in ./lib/check-tokens.mjs.
import { main } from './lib/check-tokens.mjs';

process.exitCode = main();
