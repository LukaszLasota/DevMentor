import {
  DEFAULT_ROLES,
  EMAIL_VERIFICATION_TTL_MS,
  EmailVerificationToken,
  LockMode,
  ROLES,
  UniqueConstraintViolationException,
  User,
  type Role,
} from '@devmentor/db';
import { homeFor } from '../../auth/home';
import type { Cradle } from '../../container/cradle';
import { AppError, ServiceUnavailableError, UnauthorizedError } from '../../http/errors';
import { safeReturnTo } from '../../http/return-to';
import {
  guardPasswordAttempt,
  rateLimitChecks,
  REGISTER_RATE_LIMITS,
  RESEND_RATE_LIMITS,
  SIGN_IN_RATE_LIMITS,
} from '../../security/rate-limit';
import { hashToken, randomToken } from '../../security/token';
import { alreadyRegisteredMail, registrationMail, verificationLink } from './account-mails';
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

/**
 * A verification link that is unknown, used, expired, superseded by a newer one, or opened while
 * another account is signed in (L13). Nothing is changed; the page offers a new link.
 */
export class VerificationLinkInvalidError extends AppError {
  constructor(message = 'This link is invalid or has expired.', options?: ErrorOptions) {
    super(400, 'VERIFICATION_LINK_INVALID', message, options);
  }
}

/** The one message for every failed password sign-in, so it never reveals whether an account exists. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

/** Request facts the rate limits count by; `ip` is `clientIp(...)` (null when not derivable). */
export interface AttemptContext {
  ip: string | null;
}

export interface StartRegistrationInput {
  email: string;
  /** Page to land on after the password is set (L02); dropped unless `safeReturnTo` accepts it. */
  returnTo?: string;
}

export type ResendVerificationInput = StartRegistrationInput;

export interface SetPasswordFromLinkInput {
  token: string;
  password: string;
  /** The `returnTo` the link's fragment carried. */
  returnTo?: string;
}

export interface SetPasswordFromLinkResult {
  /** Verified, with the password set and `session_version` bumped: issue a fresh `dm_session`. */
  user: User;
  /** `safeReturnTo(returnTo, homeFor(roles))`. */
  redirectTo: string;
}

export interface VerifyPasswordInput {
  email: string;
  password: string;
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

/** The `returnTo` a link may carry: a safe path, else none (the page then uses `homeFor`). */
function safeLinkReturnTo(returnTo: string | undefined): string | undefined {
  return safeReturnTo(returnTo, '') || undefined;
}

/**
 * `findOne` options that read the row with `SELECT … FOR UPDATE` inside a transaction (`refresh`:
 * the identity map must not answer with a copy loaded before the lock). A function, not a module
 * constant, so importing this module never touches `@devmentor/db` values.
 */
function lockForUpdate() {
  return { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as const;
}

function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((role, index) => role === b[index]);
}

/** Roles granted by an action; `operator` comes only from `OPERATOR_EMAILS` (reconciliation would undo a grant). */
export type GrantableRole = Exclude<Role, 'operator'>;

/** Outcome of `grantRole`. */
export interface RoleGrant {
  /** `true` when the user did not hold the role before; `session_version` was bumped. */
  changed: boolean;
  /** The normalized stored roles after the grant. */
  roles: Role[];
  /**
   * Emits `auth.user.roles_changed` when `changed` (no-op otherwise). Call it after the caller's
   * transaction commits, never inside it.
   */
  afterCommit(): Promise<void>;
}

type AccountServiceDeps = Pick<
  Cradle,
  'em' | 'env' | 'clock' | 'events' | 'logger' | 'mailSender' | 'passwordHasher' | 'rateLimiter'
>;

/**
 * Accounts: GitHub account resolution (sign-in spec rules 1–4), email registration with the
 * password set from the mailed link, password sign-in, operator reconciliation and sign-out.
 * `users.email` is set once at creation and never rewritten.
 */
export class AccountService {
  private readonly em: Cradle['em'];
  private readonly env: Cradle['env'];
  private readonly clock: Cradle['clock'];
  private readonly events: Cradle['events'];
  private readonly logger: Cradle['logger'];
  private readonly mailSender: Cradle['mailSender'];
  private readonly passwordHasher: Cradle['passwordHasher'];
  private readonly rateLimiter: Cradle['rateLimiter'];

  constructor({ em, env, clock, events, logger, mailSender, passwordHasher, rateLimiter }: AccountServiceDeps) {
    this.em = em;
    this.env = env;
    this.clock = clock;
    this.events = events;
    this.logger = logger;
    this.mailSender = mailSender;
    this.passwordHasher = passwordHasher;
    this.rateLimiter = rateLimiter;
  }

  /**
   * `POST /api/auth/register`: resolves the same way for every email (the route answers 202), so
   * nothing reveals whether an account exists. A new email gets an unverified mentee without a
   * password plus a link to set one; an existing email (any kind) gets the "someone tried to
   * register" mail and nothing changes. The user and its token are inserted in one flush (one
   * transaction) and the mail goes out after the commit: a mail failure (503) leaves the pending
   * account, and resend or GitHub (rule 2) completes it.
   */
  async startRegistration({ email: rawEmail, returnTo }: StartRegistrationInput, { ip }: AttemptContext): Promise<void> {
    const email = normalizeEmail(rawEmail);
    await this.rateLimiter.consumeAll(rateLimitChecks(REGISTER_RATE_LIMITS, { email, ip }));
    const appUrl = this.requireAppUrl();

    if ((await this.em.findOne(User, { email })) !== null) {
      await this.mailSender.send(alreadyRegisteredMail(email, appUrl));
      return;
    }

    const user = this.em.create(User, {
      email,
      roles: effectiveRoles(DEFAULT_ROLES, email, false, this.env.OPERATOR_EMAILS),
    });
    const token = this.createVerificationToken(this.em, user);

    try {
      await this.em.flush();
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error;
      }

      // A parallel registration (or GitHub sign-in) of the same email committed first.
      this.em.clear();
      await this.mailSender.send(alreadyRegisteredMail(email, appUrl));
      return;
    }

    this.logger.info({ userId: user.id }, 'Registration started');
    await this.mailSender.send(registrationMail(email, verificationLink(appUrl, token, safeLinkReturnTo(returnTo))));
  }

  /**
   * `POST /api/auth/verify-email/resend`: a new link only for an existing account without a
   * password; every other email resolves the same way with nothing sent. Older unused links of the
   * user stop working (their `expires_at` moves to now), so only the newest mail is live. The
   * password check, the retirement and the insert run in one transaction holding the user row
   * locked (`FOR UPDATE`, the lock `setPasswordFromLink` takes too): parallel resends run one after
   * another, and a resend after a committed password sees it and sends nothing.
   */
  async resendVerification({ email: rawEmail, returnTo }: ResendVerificationInput, { ip }: AttemptContext): Promise<void> {
    const email = normalizeEmail(rawEmail);
    await this.rateLimiter.consumeAll(rateLimitChecks(RESEND_RATE_LIMITS, { email, ip }));
    const appUrl = this.requireAppUrl();
    const resent = await this.em.transactional(async (em) => {
      const user = await em.findOne(User, { email }, lockForUpdate());

      if (user === null || user.passwordHash != null) {
        return null;
      }

      await this.retireLiveLinks(em, user.id, this.clock.now());

      return { userId: user.id, token: this.createVerificationToken(em, user) };
    });

    if (resent === null) {
      return;
    }

    this.logger.info({ userId: resent.userId }, 'Verification link resent');
    await this.mailSender.send(registrationMail(email, verificationLink(appUrl, resent.token, safeLinkReturnTo(returnTo))));
  }

  /**
   * `POST /api/auth/verify-email`: sets the password, verifies the email and bumps
   * `session_version`. Order: the link is checked first (cheap, and L13: a session of another
   * account refuses before anything changes), then a hashing slot (a saturated gate answers 503
   * and the link stays usable), then one transaction locks the user row (`FOR UPDATE`, serialized
   * with `resendVerification`), refuses an account that already has a password (a link only sets
   * the first password; reset is out of scope), consumes the token by one conditional UPDATE — of
   * two parallel uses exactly one succeeds — and retires the user's other live links.
   */
  async setPasswordFromLink(
    { token, password, returnTo }: SetPasswordFromLinkInput,
    currentUserId: string | null,
  ): Promise<SetPasswordFromLinkResult> {
    const tokenHash = hashToken(token);
    const link = await this.em.findOne(EmailVerificationToken, { tokenHash });

    if (link === null || link.usedAt != null || link.expiresAt <= this.clock.now()) {
      throw new VerificationLinkInvalidError();
    }

    const userId = link.user.id;

    if (currentUserId !== null && currentUserId !== userId) {
      this.logger.warn({ userId: currentUserId }, 'Verification link refused: another account is signed in');
      throw new VerificationLinkInvalidError();
    }

    const passwordHash = await this.passwordHasher.withSlot(({ hash }) => hash(password));
    let rolesChanged = false;
    const user = await this.em.transactional(async (em) => {
      const now = this.clock.now();
      const target = await em.findOneOrFail(User, { id: userId }, lockForUpdate());

      if (target.passwordHash != null) {
        this.logger.warn({ userId }, 'Verification link refused: the account already has a password');
        throw new VerificationLinkInvalidError();
      }

      const consumed = await em.nativeUpdate(
        EmailVerificationToken,
        { tokenHash, usedAt: null, expiresAt: { $gt: now } },
        { usedAt: now },
      );

      if (consumed !== 1) {
        throw new VerificationLinkInvalidError();
      }

      await this.retireLiveLinks(em, userId, now);
      target.passwordHash = passwordHash;
      target.emailVerifiedAt ??= now;
      target.sessionVersion += 1;
      rolesChanged = this.applyEffectiveRoles(target);

      return target;
    });

    this.logger.info({ userId }, 'Password set from verification link');

    if (rolesChanged) {
      await this.emitRolesChanged(user);
    }

    return { user, redirectTo: safeReturnTo(returnTo, homeFor(user.roles)) };
  }

  /**
   * `POST /api/auth/sign-in`: hashing slot → sign-in rate limits → scrypt (`guardPasswordAttempt`).
   * An unknown email and an account without a password run the same scrypt work against a dummy
   * hash, and every failure is the same 401, so neither the answer nor its timing reveals which.
   */
  async verifyPassword({ email: rawEmail, password }: VerifyPasswordInput, { ip }: AttemptContext): Promise<User> {
    const email = normalizeEmail(rawEmail);
    const checks = rateLimitChecks(SIGN_IN_RATE_LIMITS, { email, ip });
    const user = await guardPasswordAttempt(
      { passwordHasher: this.passwordHasher, rateLimiter: this.rateLimiter },
      checks,
      async ({ verify }) => {
        const found = await this.em.findOne(User, { email });
        const matches = await verify(password, found?.passwordHash ?? null);

        return matches ? found : null;
      },
    );

    if (user === null) {
      throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.reconcileOperator(user);
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

  /**
   * Adds `role` to `user`, an entity the caller has already locked (`FOR UPDATE`) in its own
   * transaction on `em`. Set-based and idempotent: every held role is kept (`mentee`, `operator`),
   * duplicates are normalized. Only a real change of the set bumps `session_version` (the caller
   * re-issues its session cookie) and is reported by `afterCommit`. Flushes on `em` when anything
   * was written, so the write fails inside the caller's transaction, not at its commit.
   */
  async grantRole(em: Cradle['em'], user: User, role: GrantableRole): Promise<RoleGrant> {
    // A new role always rewrites the stored set; a held one only when duplicates are normalized.
    const changed = !user.roles.includes(role);
    const roles = normalizeRoles([...user.roles, role]);

    if (!sameRoles(user.roles, roles)) {
      user.roles = roles;

      if (changed) {
        user.sessionVersion += 1;
      }

      await em.flush();
    }

    const snapshot = [...roles];

    return {
      changed,
      roles: snapshot,
      afterCommit: async () => {
        if (changed) {
          this.logger.info({ userId: user.id, role, roles: snapshot }, 'User role granted');
          await this.events.emit('auth.user.roles_changed', { userId: user.id, roles: [...snapshot] });
        }
      },
    };
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

  /** Rules 1–3; `null` means rule 4 (create). Changes other than the link are flushed by the caller. */
  private async findOrLink(profile: GithubProfile, email: string): Promise<User | null> {
    // Rule 1: known GitHub id → refresh login and avatar; the email stays as stored.
    const byGithubId = await this.em.findOne(User, { githubId: profile.githubId });

    if (byGithubId !== null) {
      return this.refreshGithubProfile(byGithubId, profile);
    }

    const byEmail = await this.em.findOne(User, { email });

    if (byEmail === null) {
      return null;
    }

    if (byEmail.githubId == null) {
      await this.linkGithub(byEmail, profile);
    }

    // Rule 1 again: a concurrent sign-in of the same GitHub account committed its row or link after
    // our github_id lookup (the integration race test hit this), so the email row holds our id.
    if (byEmail.githubId === profile.githubId) {
      return this.refreshGithubProfile(byEmail, profile);
    }

    // Rule 3: the email belongs to another GitHub account → refuse, change nothing.
    this.logger.warn({ userId: byEmail.id }, 'GitHub sign-in refused: email linked to another GitHub account');
    throw new GithubAccountConflictError();
  }

  /**
   * Rule 2: links GitHub's verified primary email (also completes a pending registration). The
   * write is one conditional UPDATE (`github_id IS NULL`), not check-then-write: of two parallel
   * callbacks for different GitHub accounts with the same email only one can link; the entity is
   * then reloaded, so the caller sees whichever GitHub id won (ours → rule 1, another → rule 3).
   */
  private async linkGithub(user: User, profile: GithubProfile): Promise<void> {
    const linked = await this.em.nativeUpdate(
      User,
      { id: user.id, githubId: null },
      {
        githubId: profile.githubId,
        githubLogin: profile.login,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: user.emailVerifiedAt ?? this.clock.now(),
      },
    );
    await this.em.refreshOrFail(user);

    if (linked === 1) {
      this.logger.info({ userId: user.id }, 'GitHub account linked by verified email');
    }
  }

  /** Rule 1: the email stays as stored; login and avatar follow GitHub. */
  private refreshGithubProfile(user: User, profile: GithubProfile): User {
    user.githubLogin = profile.login;
    user.avatarUrl = profile.avatarUrl;

    return user;
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

  /** A new single-use token for `user` (persisted with the next flush of `em`); returns the raw value for the mail. */
  private createVerificationToken(em: Cradle['em'], user: User): string {
    const token = randomToken();
    em.create(EmailVerificationToken, {
      user,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.clock.now().getTime() + EMAIL_VERIFICATION_TTL_MS),
    });

    return token;
  }

  /** Unused, unexpired links of the user stop working now (`expires_at` moves to `now`). */
  private async retireLiveLinks(em: Cradle['em'], userId: string, now: Date): Promise<void> {
    await em.nativeUpdate(EmailVerificationToken, { user: userId, usedAt: null, expiresAt: { $gt: now } }, { expiresAt: now });
  }

  /** Links in mails need `APP_URL`; without it nothing is written and the route answers 503. */
  private requireAppUrl(): string {
    if (this.env.APP_URL === undefined) {
      this.logger.warn('APP_URL is not set: verification links cannot be built');
      throw new ServiceUnavailableError('Email registration is unavailable.');
    }

    return this.env.APP_URL;
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
