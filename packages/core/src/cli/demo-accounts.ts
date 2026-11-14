import { DEFAULT_ROLES, User, type Role } from '@devmentor/db';
import type { Cradle } from '../container/cradle';
import { effectiveRoles } from '../services/auth/account.service';

/** The one password of every demo account with a password. Published in the README: development only. */
export const DEMO_PASSWORD = 'mock-password-not-a-secret';

export interface DemoAccount {
  email: string;
  /** GitHub stub persona whose identity the account carries (`githubIdFor(login)`), or none. */
  githubLogin: string | null;
  verified: boolean;
  /** Whether the account signs in with `DEMO_PASSWORD`. */
  password: boolean;
  /** Expected in `OPERATOR_EMAILS`; the role itself comes from there, never from the seed. */
  operator: boolean;
}

/**
 * Demo accounts of `npm run db:seed` (sign-in spec, "Dev seed"). No account holds `mentor` until
 * the mentor area exists (Epic 01 phase 3). The pending account uses a reserved domain the GitHub
 * stub never produces, so a stub sign-in cannot link and verify it.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'mock-mentee@devmentor.test', githubLogin: 'mock-mentee', verified: true, password: true, operator: false },
  { email: 'mock-operator@devmentor.test', githubLogin: 'mock-operator', verified: true, password: true, operator: true },
  { email: 'mock-github-only@devmentor.test', githubLogin: 'mock-github-only', verified: true, password: false, operator: false },
  { email: 'mock-pending@example.com', githubLogin: null, verified: false, password: false, operator: false },
];

export type SeedStatus = 'created' | 'updated' | 'unchanged';

export interface SeedResult {
  account: DemoAccount;
  roles: Role[];
  status: SeedStatus;
}

/** Stable numeric GitHub id of a stub persona (`githubIdFor` of `scripts/lib/github-stub.mjs`). */
export type GithubIdFor = (login: string) => number;

export type SeedDeps = Pick<Cradle, 'em' | 'env' | 'clock' | 'passwordHasher'>;

type SeedEm = Cradle['em'];

interface DemoState {
  roles: Role[];
  githubId: number | null;
  githubLogin: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
}

function sameState(user: User, state: DemoState): boolean {
  return (
    user.roles.length === state.roles.length &&
    user.roles.every((role, index) => role === state.roles[index]) &&
    user.githubId === state.githubId &&
    user.githubLogin === state.githubLogin &&
    user.passwordHash === state.passwordHash &&
    // `emailVerifiedAt` keeps the stored date when verified, so only "verified or not" can differ.
    (user.emailVerifiedAt == null) === (state.emailVerifiedAt === null)
  );
}

/** Keeps a stored hash that already matches `DEMO_PASSWORD` (re-seed changes nothing); else hashes anew. */
function demoPasswordHash({ passwordHasher }: SeedDeps, stored: string | null): Promise<string> {
  return passwordHasher.withSlot(async ({ hash, verify }) => {
    const matches = stored !== null && (await verify(DEMO_PASSWORD, stored).catch(() => false));

    return matches ? stored : hash(DEMO_PASSWORD);
  });
}

async function upsert(em: SeedEm, deps: SeedDeps, account: DemoAccount, githubIdFor: GithubIdFor): Promise<SeedResult> {
  const githubId = account.githubLogin === null ? null : githubIdFor(account.githubLogin);

  if (githubId !== null) {
    const holder = await em.findOne(User, { githubId });

    if (holder !== null && holder.email !== account.email) {
      throw new Error(
        `The GitHub identity of stub persona "${account.githubLogin}" is linked to ${holder.email}; nothing was changed.`,
      );
    }
  }

  const user = await em.findOne(User, { email: account.email });
  const state: DemoState = {
    roles: effectiveRoles(DEFAULT_ROLES, account.email, account.verified, deps.env.OPERATOR_EMAILS),
    githubId,
    githubLogin: account.githubLogin,
    passwordHash: account.password ? await demoPasswordHash(deps, user?.passwordHash ?? null) : null,
    emailVerifiedAt: account.verified ? (user?.emailVerifiedAt ?? deps.clock.now()) : null,
  };

  if (user === null) {
    em.create(User, { email: account.email, ...state });

    return { account, roles: state.roles, status: 'created' };
  }

  if (sameState(user, state)) {
    return { account, roles: state.roles, status: 'unchanged' };
  }

  // Credentials or roles changed back to the demo state: sessions issued for the old state end.
  Object.assign(user, state);
  user.sessionVersion += 1;

  return { account, roles: state.roles, status: 'updated' };
}

/**
 * Creates or restores the demo accounts in one transaction, matched by email. Re-running changes
 * nothing; an account changed since (password, GitHub link, verification) is put back. Other rows
 * are never touched, and a demo GitHub identity linked to another account stops the whole seed.
 */
export function seedDemoAccounts(deps: SeedDeps, githubIdFor: GithubIdFor): Promise<SeedResult[]> {
  return deps.em.transactional(async (em) => {
    const results: SeedResult[] = [];

    for (const account of DEMO_ACCOUNTS) {
      results.push(await upsert(em, deps, account, githubIdFor));
    }

    return results;
  });
}
