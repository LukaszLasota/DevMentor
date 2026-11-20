import { randomUUID } from 'node:crypto';
import { CONNECT_ACCOUNT_MENTOR_UNIQUE, ConnectAccount, MentorProfile, UniqueConstraintViolationException } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { CONNECT_FAILED_MESSAGE, CONNECT_UNAVAILABLE_MESSAGE, ConnectService, NO_CONNECT_ACCOUNT_MESSAGE, NO_MENTOR_PROFILE_MESSAGE } from './connect.service';
import { FakeConnectGateway } from './fake-connect-gateway';

const NOW = new Date('2026-06-22T16:00:00.000Z');
const USER_ID = randomUUID();

type Where = Record<string, unknown>;

function setup({ appUrl = 'https://app.test' as string | null, withProfile = true } = {}) {
  const profile = Object.assign(new MentorProfile(), { id: randomUUID(), user: { id: USER_ID } });
  const accounts: ConnectAccount[] = [];
  const gateway = new FakeConnectGateway();
  const matches = (row: object, where: Where) =>
    Object.entries(where).every(([key, value]) => {
      const actual = (row as Where)[key];
      return (actual !== null && typeof actual === 'object' && 'id' in actual ? (actual as { id: string }).id : actual) === value;
    });
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Where) =>
      entity === MentorProfile ? (withProfile && where.user === USER_ID ? profile : null) : (accounts.find((row) => matches(row, where)) ?? null),
    ),
    create: vi.fn((_entity: unknown, data: Partial<ConnectAccount> & { mentorProfile: string }) => {
      const account = Object.assign(new ConnectAccount(), { id: randomUUID(), ...data, mentorProfile: { id: data.mentorProfile } });
      accounts.push(account);
      return account;
    }),
    nativeUpdate: vi.fn(async (_entity: unknown, where: { id: string }, data: Partial<ConnectAccount>) => {
      Object.assign(accounts.find((row) => row.id === where.id) as ConnectAccount, data);
      return 1;
    }),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => callback(em)),
  };
  const logger = { warn: vi.fn() };
  const service = new ConnectService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', APP_URL: appUrl ?? '' }),
    logger: logger as unknown as Cradle['logger'],
    connectGateway: gateway,
  });

  return { service, profile, accounts, gateway, em, logger };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('ConnectService.start', () => {
  it('creates one Express account, stores its status and returns a fresh link back to /mentor/payouts', async () => {
    const { service, profile, accounts, gateway } = setup();

    await expect(service.start(USER_ID)).resolves.toEqual({ url: `https://connect.fake.test/onboard/acct_fake_${profile.id}/1` });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ providerAccountId: `acct_fake_${profile.id}`, onboardingStatus: 'action_required', lastReconciledAt: NOW });
    expect(gateway.links[0]).toEqual({
      accountId: `acct_fake_${profile.id}`,
      returnUrl: 'https://app.test/mentor/payouts?connect=return',
      refreshUrl: 'https://app.test/mentor/payouts?connect=reauth',
    });

    await expect(service.start(USER_ID)).resolves.toEqual({ url: `https://connect.fake.test/onboard/acct_fake_${profile.id}/2` });
    expect(accounts).toHaveLength(1);
  });

  it('reads the stored row after losing the insert race; other storage failures propagate', async () => {
    const { service, accounts, em } = setup();
    em.transactional.mockImplementationOnce(async () => {
      accounts.push(Object.assign(new ConnectAccount(), { id: randomUUID(), mentorProfile: { id: 'x' }, providerAccountId: 'acct_winner' }));
      throw new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint: CONNECT_ACCOUNT_MENTOR_UNIQUE }));
    });
    em.findOne.mockImplementationOnce(async () => Object.assign(new MentorProfile(), { id: 'x', user: { id: USER_ID } }) as never);
    em.findOne.mockImplementationOnce(async () => null);

    await expect(service.start(USER_ID)).resolves.toEqual({ url: 'https://connect.fake.test/onboard/acct_winner/1' });

    const broken = setup();
    broken.em.transactional.mockRejectedValueOnce(new Error('db down'));
    await expect(broken.service.start(USER_ID)).rejects.toThrow('db down');
  });

  it('answers 503 without Stripe or APP_URL, 409 when Stripe refuses the account, 503 when it does not answer', async () => {
    const unconfigured = setup();
    unconfigured.gateway.configured = false;
    expect(await rejection(unconfigured.service.start(USER_ID))).toMatchObject({ status: 503, code: 'PAYMENTS_UNAVAILABLE', message: CONNECT_UNAVAILABLE_MESSAGE });
    expect(await rejection(setup({ appUrl: null }).service.start(USER_ID))).toMatchObject({ status: 503 });

    const refused = setup();
    refused.gateway.nextFailure = { kind: 'rejected', status: 400, code: 'country_unsupported' };
    expect(await rejection(refused.service.start(USER_ID))).toMatchObject({ status: 409, code: 'CONNECT_FAILED', message: CONNECT_FAILED_MESSAGE });
    expect(refused.accounts).toHaveLength(0);

    const down = setup();
    down.gateway.nextFailure = { kind: 'retryable' };
    expect(await rejection(down.service.start(USER_ID))).toMatchObject({ status: 503 });

    const noLink = setup();
    await noLink.service.start(USER_ID);
    noLink.gateway.nextFailure = { kind: 'retryable' };
    expect(await rejection(noLink.service.start(USER_ID))).toMatchObject({ status: 503 });
  });

  it('answers 404 without a mentor profile', async () => {
    expect(await rejection(setup({ withProfile: false }).service.start(USER_ID))).toMatchObject({ status: 404, message: NO_MENTOR_PROFILE_MESSAGE });
  });
});

describe('ConnectService.getOwn and refresh', () => {
  it('shows nothing before setup, then the stored state, and refresh re-reads Stripe', async () => {
    const { service, profile, gateway } = setup();

    await expect(service.getOwn(USER_ID)).resolves.toEqual({ onboardingStatus: null, lastReconciledAt: null });
    expect(await rejection(service.refresh(USER_ID))).toMatchObject({ status: 404, message: NO_CONNECT_ACCOUNT_MESSAGE });

    await service.start(USER_ID);
    await expect(service.getOwn(USER_ID)).resolves.toEqual({ onboardingStatus: 'action_required', lastReconciledAt: NOW.toISOString() });

    gateway.update(`acct_fake_${profile.id}`, { payoutsEnabled: true, detailsSubmitted: true, transfers: 'active', currentlyDue: [] });
    await expect(service.refresh(USER_ID)).resolves.toEqual({ onboardingStatus: 'enabled', lastReconciledAt: NOW.toISOString() });
  });

  it('treats a deleted or deauthorized account as restricted, and answers 503 when Stripe is down', async () => {
    const { service, gateway, accounts, logger } = setup();
    await service.start(USER_ID);

    gateway.nextFailure = { kind: 'rejected', status: 403, code: null };
    await expect(service.refresh(USER_ID)).resolves.toMatchObject({ onboardingStatus: 'restricted' });

    gateway.nextFailure = { kind: 'retryable' };
    expect(await rejection(service.refresh(USER_ID))).toMatchObject({ status: 503 });
    expect(logger.warn).toHaveBeenCalledWith({ connect: { kind: 'retryable' } }, 'Could not read a Stripe connected account');

    gateway.nextFailure = { kind: 'rejected', status: 400, code: 'x' };
    await expect(service.reconcile(accounts[0] as ConnectAccount)).resolves.toBeNull();
  });
});
