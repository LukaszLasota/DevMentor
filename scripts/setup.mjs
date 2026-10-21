// `npm run setup` entry point; logic and tests live in ./lib/setup.mjs.
import { main } from './lib/setup.mjs';

process.exitCode = await main();
