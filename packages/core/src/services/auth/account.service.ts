import { DEFAULT_ROLES, ROLES, UniqueConstraintViolationException, User, type Role } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { AppError } from '../../http/errors';
import type { GithubProfile } from './github-oauth.service';

/**
 * GitHub's verified primary email belongs to an account already linked to a different GitHub
 * account (rule 3). Nothing is changed; `redirectHandler` turns the code into
 * `/sign-in?error=github_account_conflict`.
 */
export class GithubAccountConflictError extends AppError {
  constructor(message = 'This email is already linked to a different GitHub account.', options?: ErrorOptions) {
    super(409, 'GITHUB_ACCOUNT_CONFLICT', message, options);
  }
}

/** Lower-cases and trims an email; matching uses nothing else (no alias or dot stripping). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deduplicates roles in the stable `ROLES` order; an empty set becomes the default roles. */
export function normalizeRoles(roles: readonly Role[]): Role[] {
  const held = new Set(roles);
  const normalized = ROLES.filter((role) => held.has(role));

  return normalized.length > 0 ? normalized : [...DEFAULT_ROLES];
}

/**
 * The roles a user effectively holds: `operator` iff the verified email is in `OPERATOR_EMAILS`
 * (the authority), every other stored role kept, normalized. Pure, so the session check can reuse it.
 */
export function effectiveRoles(
  storedRoles: readonly Role[],
  email: string,
  emailVerified: boolean,
  operatorEmails: readonly string[],
): Role[] {
  const isOperator = emailVerified && operatorEmails.includes(normalizeEmail(email));
  const others = storedRoles.filter((role) => role !== 'operator');

  return normalizeRoles(isOperator ? [...others, 'operator'] : others);
}

function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((role, index) => role === b[index]);
}

/**
 * Accounts: GitHub account resolution (sign-in spec rules 1–4), operator reconciliation and
 * sign-out. `users.email` is set once at creation and never rewritten.
 */
export class AccountService {
  private readonly em: Cradle['em'];
  private readonly env: Cradle['env'];
  private readonly clock: Cradle['clock'];
  private readonly events: Cradle['events'];
  private readonly logger: Cradle['logger'];

  constructor({ em, env, clock, events, logger }: Pick<Cradle, 'em' | 'env' | 'clock' | 'events' | 'logger'>) {
    this.em = em;
    this.env = env;
    this.clock = clock;
    this.events = events;
    this.logger = logger;
  }

  /**
   * Finds, links or creates the account for a GitHub profile and reconciles its operator role.
   * A concurrent first sign-in that wins the insert race makes ours fail on a unique constraint;
   * the lookup then runs once more and finds (or links) the winner's row.
   */
  async resolveGithubAccount(profile: GithubProfile): Promise<User> {
    try {
      return await this.resolveOnce(profile);
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error;
      }

      this.logger.info({ githubId: profile.githubId }, 'Concurrent GitHub sign-in, re-reading the account');
      // Drop the failed insert from the unit of work before reading again.
      this.em.clear();

      return this.resolveOnce(profile);
    }
  }

  /**
   * Persists the effective roles when the stored set disagrees (allowlist added or removed,
   * duplicates). Idempotent; keeps other roles; emits `auth.user.roles_changed` after the flush;
   * never bumps `session_version` (a page render cannot re-issue the cookie).
   */
  async reconcileOperator(user: User): Promise<User> {
    if (this.applyEffectiveRoles(user)) {
      await this.em.flush();
      await this.emitRolesChanged(user);
    }

    return user;
  }

  /** Global sign-out: bumps `session_version`, so every token of the user stops verifying. */
  async signOut(userId: string): Promise<void> {
    const user = await this.em.findOne(User, { id: userId });

    if (user === null) {
      return;
    }

    user.sessionVersion += 1;
    await this.em.flush();
  }

  private async resolveOnce(profile: GithubProfile): Promise<User> {
    const email = normalizeEmail(profile.email);
    const user = await this.findOrLink(profile, email);

    if (user === null) {
      return this.create(profile, email);
    }

    const rolesChanged = this.applyEffectiveRoles(user);
    await this.em.flush();

    if (rolesChanged) {
      await this.emitRolesChanged(user);
    }

    return user;
  }

  /** Rules 1–3; `null` means rule 4 (create). Changes are flushed by the caller. */
  private async findOrLink(profile: GithubProfile, email: string): Promise<User | null> {
    // Rule 1: known GitHub id → refresh login and avatar; the email stays as stored.
    const byGithubId = await this.em.findOne(User, { githubId: profile.githubId });

    if (byGithubId !== null) {
      byGithubId.githubLogin = profile.login;
      byGithubId.avatarUrl = profile.avatarUrl;

      return byGithubId;
    }

    const byEmail = await this.em.findOne(User, { email });

    if (byEmail === null) {
      return null;
    }

    // Rule 3: the email belongs to another GitHub account → refuse, change nothing.
    if (byEmail.githubId != null) {
      this.logger.warn({ userId: byEmail.id }, 'GitHub sign-in refused: email linked to another GitHub account');
      throw new GithubAccountConflictError();
    }

    // Rule 2: link GitHub's verified primary email; also completes a pending registration.
    byEmail.githubId = profile.githubId;
    byEmail.githubLogin = profile.login;
    byEmail.avatarUrl = profile.avatarUrl;
    byEmail.emailVerifiedAt ??= this.clock.now();
    this.logger.info({ userId: byEmail.id }, 'GitHub account linked by verified email');

    return byEmail;
  }

  /** Rule 4: a new mentee with the verified email, operator already reconciled. */
  private async create(profile: GithubProfile, email: string): Promise<User> {
    const user = this.em.create(User, {
      email,
      roles: effectiveRoles(DEFAULT_ROLES, email, true, this.env.OPERATOR_EMAILS),
      githubId: profile.githubId,
      githubLogin: profile.login,
      avatarUrl: profile.avatarUrl,
      emailVerifiedAt: this.clock.now(),
    });
    await this.em.flush();
    this.logger.info({ userId: user.id }, 'Account created from GitHub');

    return user;
  }

  /** Sets the effective roles on `user`; `true` when the stored set changed. */
  private applyEffectiveRoles(user: User): boolean {
    const roles = effectiveRoles(user.roles, user.email, user.emailVerifiedAt != null, this.env.OPERATOR_EMAILS);

    if (sameRoles(user.roles, roles)) {
      return false;
    }

    user.roles = roles;

    return true;
  }

  private async emitRolesChanged(user: User): Promise<void> {
    this.logger.info({ userId: user.id, roles: user.roles }, 'User roles reconciled');
    await this.events.emit('auth.user.roles_changed', { userId: user.id, roles: [...user.roles] });
  }
}
