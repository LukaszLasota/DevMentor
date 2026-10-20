// `npm run audit` entry point; logic and tests live in ./lib/audit.mjs.
import { main } from './lib/audit.mjs';

process.exitCode = main();
