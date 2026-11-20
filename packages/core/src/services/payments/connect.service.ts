import { CONNECT_ACCOUNT_MENTOR_UNIQUE, ConnectAccount, isUniqueViolation, MentorProfile, type OnboardingStatus } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../../http/errors';
import { onboardingStatusOf } from './connect-status';

export const CONNECT_UNAVAILABLE_MESSAGE = 'Payouts cannot be set up right now. Try again later.';
export const CONNECT_FAILED_MESSAGE = 'Stripe could not set up payouts for this account. Contact us.';
export const NO_MENTOR_PROFILE_MESSAGE = 'Mentor profile not found.';
export const NO_CONNECT_ACCOUNT_MESSAGE = 'Set up payouts first.';

const unavailable = () => new ServiceUnavailableError(CONNECT_UNAVAILABLE_MESSAGE, { code: 'PAYMENTS_UNAVAILABLE' });

/** `/mentor/payouts`: the mentor's own Connect state; `null` status = not set up. */
export interface ConnectView {
  onboardingStatus: OnboardingStatus | null;
  lastReconciledAt: string | null;
}

/**
 * Stripe Connect onboarding (spec 2026-11-21-mentor-payouts, #26): one Express account per mentor,
 * created with a stable idempotency key, and a fresh hosted onboarding link on every start (never
 * stored or logged). Status is re-read on refresh and before every payout; only ids and the
 * normalized status are kept.
 */
export class ConnectService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly env: Cradle['env'];
  private readonly logger: Cradle['logger'];
  private readonly connectGateway: Cradle['connectGateway'];

  constructor({ em, clock, env, logger, connectGateway }: Pick<Cradle, 'em' | 'clock' | 'env' | 'logger' | 'connectGateway'>) {
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.logger = logger;
    this.connectGateway = connectGateway;
  }

  async getOwn(userId: string): Promise<ConnectView> {
    const account = await this.em.findOne(ConnectAccount, { mentorProfile: (await this.profileOf(userId)).id });

    return view(account);
  }

  /** Creates the account when there is none, then returns a fresh onboarding link for the browser. */
  async start(userId: string): Promise<{ url: string }> {
    const profile = await this.profileOf(userId);
    const appUrl = this.env.APP_URL;

    if (!this.connectGateway.configured || appUrl === undefined) {
      throw unavailable();
    }

    const account = (await this.em.findOne(ConnectAccount, { mentorProfile: profile.id })) ?? (await this.create(profile));
    const link = await this.connectGateway.createAccountLink(
      account.providerAccountId,
      `${appUrl}/mentor/payouts?connect=return`,
      `${appUrl}/mentor/payouts?connect=reauth`,
    );

    if (link.kind !== 'ok') {
      this.logger.warn({ connect: { kind: link.kind } }, 'Could not create a Stripe onboarding link');
      throw unavailable();
    }

    return { url: link.data.url };
  }

  /** Re-reads the mentor's account at Stripe and stores the normalized status. */
  async refresh(userId: string): Promise<ConnectView> {
    const account = await this.em.findOne(ConnectAccount, { mentorProfile: (await this.profileOf(userId)).id });

    if (account === null) {
      throw new NotFoundError(NO_CONNECT_ACCOUNT_MESSAGE);
    }

    if ((await this.reconcile(account)) === null) {
      throw unavailable();
    }

    this.em.clear();

    return view(await this.em.findOne(ConnectAccount, { id: account.id }));
  }

  /**
   * Reads the account at Stripe and stores its status; returns it, or `null` when Stripe did not
   * answer (the stored status is unchanged). A deleted or deauthorized account (403/404) is `restricted`.
   */
  async reconcile(account: ConnectAccount): Promise<OnboardingStatus | null> {
    const result = await this.connectGateway.retrieveAccount(account.providerAccountId);
    let status: OnboardingStatus;

    if (result.kind === 'ok') {
      status = onboardingStatusOf(result.data);
    } else if (result.kind === 'rejected' && (result.status === 403 || result.status === 404)) {
      status = 'restricted';
    } else {
      this.logger.warn({ connect: { kind: result.kind } }, 'Could not read a Stripe connected account');

      return null;
    }

    await this.em.nativeUpdate(ConnectAccount, { id: account.id }, { onboardingStatus: status, lastReconciledAt: this.clock.now() });

    return status;
  }

  private async create(profile: MentorProfile): Promise<ConnectAccount> {
    const created = await this.connectGateway.createAccount(profile.id);

    if (created.kind === 'rejected') {
      this.logger.warn({ connect: { code: created.code } }, 'Stripe refused to create a connected account');
      throw new ConflictError(CONNECT_FAILED_MESSAGE, { code: 'CONNECT_FAILED' });
    }

    if (created.kind !== 'ok') {
      throw unavailable();
    }

    try {
      // Its own fork: a lost insert race (two clicks) poisons that unit of work only.
      return await this.em.transactional(async (em) =>
        em.create(ConnectAccount, {
          mentorProfile: profile.id,
          providerAccountId: created.data.id,
          onboardingStatus: onboardingStatusOf(created.data),
          lastReconciledAt: this.clock.now(),
        }),
      );
    } catch (error) {
      // The same idempotency key gave the other request the same Stripe account: read its row.
      if (isUniqueViolation(error, CONNECT_ACCOUNT_MENTOR_UNIQUE)) {
        return (await this.em.findOne(ConnectAccount, { mentorProfile: profile.id })) as ConnectAccount;
      }

      throw error;
    }
  }

  private async profileOf(userId: string): Promise<MentorProfile> {
    const profile = await this.em.findOne(MentorProfile, { user: userId });

    if (profile === null) {
      throw new NotFoundError(NO_MENTOR_PROFILE_MESSAGE);
    }

    return profile;
  }
}

function view(account: ConnectAccount | null): ConnectView {
  return account === null
    ? { onboardingStatus: null, lastReconciledAt: null }
    : { onboardingStatus: account.onboardingStatus, lastReconciledAt: account.lastReconciledAt.toISOString() };
}
