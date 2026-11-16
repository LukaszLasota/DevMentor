// `npm run check:agents` entry point; logic and tests live in ./lib/check-agents.mjs.
import { main } from './lib/check-agents.mjs';

process.exitCode = main();
