import { DEFAULT_ROLES, MentorProfile, User, type Role } from '@devmentor/db';
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
  /** Holds `mentor` and has a `MentorProfile` (as after an accepted invitation). */
  mentor: boolean;
}

/**
 * Demo accounts of `npm run db:seed` (sign-in spec, "Dev seed"). `mock-mentee` stays a plain mentee
 * so it can accept an invitation in a manual test; `mock-mentor` is a ready mentor; the operator
 * also mentors (the course's operator persona: both sidebar sections). The pending account uses a
 * reserved domain the GitHub stub never produces, so a stub sign-in cannot link and verify it.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'mock-mentee@devmentor.test', githubLogin: 'mock-mentee', verified: true, password: true, operator: false, mentor: false },
  { email: 'mock-mentor@devmentor.test', githubLogin: 'mock-mentor', verified: true, password: true, operator: false, mentor: true },
  { email: 'mock-operator@devmentor.test', githubLogin: 'mock-operator', verified: true, password: true, operator: true, mentor: true },
  { email: 'mock-github-only@devmentor.test', githubLogin: 'mock-github-only', verified: true, password: false, operator: false, mentor: false },
  { email: 'mock-pending@example.com', githubLogin: null, verified: false, password: false, operator: false, mentor: false },
];

const DAY_MS = 86_400_000;

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

/** Stored roles of a demo account before operator reconciliation (`OPERATOR_EMAILS` decides that one). */
function demoRoles(account: DemoAccount): Role[] {
  return account.mentor ? [...DEFAULT_ROLES, 'mentor'] : [...DEFAULT_ROLES];
}

/** The publish-by deadline an accepted invitation would set now (spec 2026-10-21-mentor-invitations). */
function publishDeadline({ clock, env }: SeedDeps): Date {
  return new Date(clock.now().getTime() + env.MENTOR_PUBLISH_WINDOW_DAYS * DAY_MS);
}

/**
 * Gives an existing mentor demo account its `MentorProfile` when it has none. An existing deadline
 * is never moved, so re-seeding does not reset it. Returns whether anything was written.
 */
async function ensureMentorProfile(em: SeedEm, deps: SeedDeps, account: DemoAccount, user: User): Promise<boolean> {
  if (!account.mentor) {
    return false;
  }

  const profile = await em.findOne(MentorProfile, { user: user.id });

  if (profile === null) {
    em.create(MentorProfile, { user, initialPublishDueAt: publishDeadline(deps) });
    return true;
  }

  if (profile.initialPublishDueAt == null) {
    profile.initialPublishDueAt = publishDeadline(deps);
    return true;
  }

  return false;
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
    roles: effectiveRoles(demoRoles(account), account.email, account.verified, deps.env.OPERATOR_EMAILS),
    githubId,
    githubLogin: account.githubLogin,
    passwordHash: account.password ? await demoPasswordHash(deps, user?.passwordHash ?? null) : null,
    emailVerifiedAt: account.verified ? (user?.emailVerifiedAt ?? deps.clock.now()) : null,
  };

  if (user === null) {
    const created = em.create(User, { email: account.email, ...state });

    if (account.mentor) {
      em.create(MentorProfile, { user: created, initialPublishDueAt: publishDeadline(deps) });
    }

    return { account, roles: state.roles, status: 'created' };
  }

  const profileWritten = await ensureMentorProfile(em, deps, account, user);

  if (sameState(user, state)) {
    return { account, roles: state.roles, status: profileWritten ? 'updated' : 'unchanged' };
  }

  // Credentials or roles changed back to the demo state: sessions issued for the old state end.
  Object.assign(user, state);
  user.sessionVersion += 1;

  return { account, roles: state.roles, status: 'updated' };
}

/**
 * Creates or restores the demo accounts in one transaction, matched by email. Re-running changes
 * nothing; an account changed since (password, GitHub link, verification, roles) is put back, and a
 * mentor account missing its `MentorProfile` gets one. Other rows are never touched (a profile left
 * on a demo account that is no mentor stays), and a demo GitHub identity linked to another account
 * stops the whole seed.
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
