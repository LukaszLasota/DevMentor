import 'server-only';

// Command-line entry of @devmentor/core (`scripts/*.mts`, run with `tsx --conditions=react-server`).
export {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  seedDemoAccounts,
  type DemoAccount,
  type GithubIdFor,
  type SeedDeps,
  type SeedResult,
  type SeedStatus,
} from './demo-accounts';
export { formatSeedReport, runSeedCli, SEED_REFUSED_IN_PRODUCTION, type SeedCliOptions } from './seed-cli';
