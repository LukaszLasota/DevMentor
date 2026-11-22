import { randomUUID } from 'node:crypto';
import { Booking, BookingReport, ConnectAccount, LockMode, MentorProfile, PAYOUT_BOOKING_UNIQUE, Payout, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { FakeCheckoutGateway } from './fake-checkout-gateway';
import { FakeConnectGateway } from './fake-connect-gateway';
import { CLAIM_TIMEOUT_MS, PAYOUT_DELAY_MS, PayoutService, RELEASE_BATCH, splitFee } from './payout.service';

const NOW = new Date('2026-06-25T12:00:00.000Z');
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const ago = (ms: number) => new Date(NOW.getTime() - ms);

type Where = Record<string, unknown>;

function valueOf(actual: unknown): unknown {
  return actual !== null && typeof actual === 'object' && 'id' in actual ? (actual as { id: string }).id : actual;
}

/** Equality (references by id), `$in`, `$ne`, `$lte` on dates. */
function matches(row: object, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = valueOf((row as Where)[key]);

    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const op = expected as { $in?: unknown[]; $ne?: unknown; $lte?: Date };
      if (op.$in) return op.$in.includes(actual);
      if ('$ne' in op) return actual !== op.$ne;
      return (actual as Date).getTime() <= (op.$lte as Date).getTime();
    }

    return (actual ?? null) === expected;
  });
}

async function setup({ bookings = 1, connected = true, enabled = true } = {}) {
  const checkout = new FakeCheckoutGateway();
  const connect = new FakeConnectGateway();
  const mentorUser = Object.assign(new User(), { id: randomUUID(), email: 'ada@devmentor.test' });
  const profile = Object.assign(new MentorProfile(), { id: randomUUID(), displayName: 'Ada', user: Object.assign(mentorUser, { getEntity: () => mentorUser }) });
  const rows = {
    bookings: [] as Booking[],
    payouts: [] as Payout[],
    accounts: [] as ConnectAccount[],
    reports: [] as BookingReport[],
  };

  for (let n = 0; n < bookings; n += 1) {
    const booking = Object.assign(new Booking(), {
      id: randomUUID(),
      mentorProfile: Object.assign(profile, { getEntity: () => profile }),
      status: 'confirmed',
      startsAt: ago(PAYOUT_DELAY_MS + (n + 1) * 3_600_000),
      endsAt: ago(PAYOUT_DELAY_MS + (n + 1) * 3_600_000 - 25 * 60_000),
      priceCents: 15000,
      currency: 'PLN',
      feeBps: 2000,
      checkoutSessionId: null as string | null,
    });
    const { data } = (await checkout.createSession({
      bookingId: booking.id,
      amountCents: 15000,
      currency: 'PLN',
      productName: 'x',
      expiresAt: NOW,
      successUrl: 's',
      cancelUrl: 'c',
    })) as { data: { id: string } };
    checkout.complete(data.id);
    booking.checkoutSessionId = data.id;
    rows.bookings.push(booking);
  }

  if (connected) {
    const created = (await connect.createAccount(profile.id)) as { data: { id: string } };
    if (enabled) connect.update(created.data.id, { payoutsEnabled: true, detailsSubmitted: true, transfers: 'active', currentlyDue: [] });
    rows.accounts.push(Object.assign(new ConnectAccount(), { id: randomUUID(), mentorProfile: profile, providerAccountId: created.data.id, onboardingStatus: 'action_required' }));
  }

  const table = (entity: unknown): object[] =>
    entity === Booking ? rows.bookings : entity === Payout ? rows.payouts : entity === ConnectAccount ? rows.accounts : rows.reports;
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Where) => table(entity).find((row) => matches(row, where)) ?? null),
    find: vi.fn(async (entity: unknown, where: Where, options?: { limit?: number }) => table(entity).filter((row) => matches(row, where)).slice(0, options?.limit)),
    create: vi.fn((_entity: unknown, data: Partial<Payout> & { booking: string; mentorProfile: string }) => {
      const booking = rows.bookings.find((row) => row.id === data.booking) as Booking;
      const payout = Object.assign(new Payout(), { id: randomUUID(), attempt: 1, ...data, booking: Object.assign(booking, { getEntity: () => booking }), mentorProfile: booking.mentorProfile, updatedAt: NOW });
      rows.payouts.push(payout);
      return payout;
    }),
    nativeUpdate: vi.fn(async (_entity: unknown, where: Where, data: Partial<Payout>) => {
      const hit = rows.payouts.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data, { updatedAt: NOW }));
      return hit.length;
    }),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      const result = await callback(em);
      rows.payouts.forEach((row) => Object.assign(row, { updatedAt: row.updatedAt ?? NOW }));
      return result;
    }),
  };
  const connectService = {
    reconcile: vi.fn(async (account: ConnectAccount) => {
      const result = await connect.retrieveAccount(account.providerAccountId);
      return result.kind === 'ok' ? (result.data.payoutsEnabled ? 'enabled' : 'action_required') : null;
    }),
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const service = new PayoutService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    logger: logger as unknown as Cradle['logger'],
    checkoutGateway: checkout,
    connectGateway: connect,
    connectService: connectService as unknown as Cradle['connectService'],
  });

  return { service, rows, checkout, connect, em, logger, connectService, booking: rows.bookings[0] as Booking, account: rows.accounts[0] };
}

describe('splitFee', () => {
  it.each([
    [15000, 2000, 3000, 12000],
    [15001, 2000, 3000, 12001],
    [15003, 2000, 3001, 12002],
    [9999, 1500, 1500, 8499],
    [100, 0, 0, 100],
  ])('%i cents at %i bps → fee %i, net %i (integer cents, fee + net = gross)', (gross, bps, fee, net) => {
    expect(splitFee(gross, bps)).toEqual({ feeCents: fee, netCents: net });
  });
});

describe('PayoutService.releaseDue', () => {
  it('transfers 80% of a due session to the enabled account, bound to its charge, once', async () => {
    const { service, rows, connect, booking, account, em } = await setup();

    await expect(service.releaseDue()).resolves.toEqual({ transferred: 1, held: 0, failed: 0, inFlight: 0, remaining: 0 });

    expect(rows.payouts[0]).toMatchObject({ grossCents: 15000, feeBps: 2000, feeCents: 3000, netCents: 12000, status: 'transferred', chargeId: `ch_fake_${booking.id}`, transferredAt: NOW });
    expect(connect.transfers).toEqual([
      expect.objectContaining({ bookingId: booking.id, attempt: 1, amountCents: 12000, currency: 'PLN', destination: account?.providerAccountId, sourceTransaction: `ch_fake_${booking.id}` }),
    ]);
    expect(rows.payouts[0]?.transferId).toBe(`tr_fake_${booking.id}_1`);
    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id }, LOCK);

    await expect(service.releaseDue()).resolves.toEqual({ transferred: 0, held: 0, failed: 0, inFlight: 0, remaining: 0 });
    expect(connect.transfers).toHaveLength(1);
  });

  it('leaves sessions that ended less than a day ago, and cancelled ones, alone', async () => {
    const { service, rows, booking } = await setup({ bookings: 2 });
    booking.endsAt = ago(PAYOUT_DELAY_MS - 60_000);
    (rows.bookings[1] as Booking).status = 'cancelled';

    await expect(service.releaseDue()).resolves.toEqual({ transferred: 0, held: 0, failed: 0, inFlight: 0, remaining: 0 });
    expect(rows.payouts).toHaveLength(0);
  });

  it('holds without a connected account or with one that is not enabled, and releases once it is', async () => {
    const none = await setup({ connected: false });
    await expect(none.service.releaseDue()).resolves.toMatchObject({ held: 1 });
    expect(none.rows.payouts[0]).toMatchObject({ status: 'held', holdReason: 'connect_not_enabled', netCents: 12000 });

    const pending = await setup({ enabled: false });
    await expect(pending.service.releaseDue()).resolves.toMatchObject({ held: 1 });
    pending.connect.update(pending.account?.providerAccountId as string, { payoutsEnabled: true, transfers: 'active' });
    await expect(pending.service.releaseDue()).resolves.toMatchObject({ transferred: 1 });
    expect(pending.rows.payouts[0]).toMatchObject({ status: 'transferred', holdReason: null });
  });

  it('uses the stored status when Stripe does not answer the account read', async () => {
    const { service, connectService, account } = await setup();
    connectService.reconcile.mockResolvedValueOnce(null);
    (account as ConnectAccount).onboardingStatus = 'enabled';

    await expect(service.releaseDue()).resolves.toMatchObject({ transferred: 1 });
  });

  it('holds a disputed session until the report is resolved', async () => {
    const { service, rows, booking } = await setup();
    rows.reports.push(Object.assign(new BookingReport(), { id: randomUUID(), booking, resolvedAt: null }));

    await expect(service.releaseDue()).resolves.toMatchObject({ held: 1 });
    expect(rows.payouts[0]).toMatchObject({ status: 'held', holdReason: 'disputed' });

    (rows.reports[0] as BookingReport).resolvedAt = NOW;
    await expect(service.releaseDue()).resolves.toMatchObject({ transferred: 1 });
  });

  it.each([
    ['refunded', { refunded: true }],
    ['partly refunded', { amountRefunded: 100 }],
    ['disputed', { disputed: true }],
  ])('holds a %s charge (a chargeback or a Dashboard refund)', async (_case, change) => {
    const { service, rows, checkout, booking, connect } = await setup();
    checkout.chargeChanges.set(booking.checkoutSessionId as string, change);

    await expect(service.releaseDue()).resolves.toMatchObject({ held: 1 });
    expect(rows.payouts[0]).toMatchObject({ status: 'held', holdReason: 'charge_reversed' });
    expect(connect.transfers).toHaveLength(0);
  });

  it('fails a booking without a charge, and leaves an unreadable charge for the next run', async () => {
    const missing = await setup();
    missing.booking.checkoutSessionId = 'cs_unknown';
    await expect(missing.service.releaseDue()).resolves.toMatchObject({ failed: 1 });
    expect(missing.rows.payouts[0]).toMatchObject({ status: 'failed', failureCode: 'charge_missing' });

    const down = await setup();
    down.checkout.nextFailure = { kind: 'retryable' };
    await expect(down.service.releaseDue()).resolves.toMatchObject({ inFlight: 1 });
    expect(down.connect.transfers).toHaveLength(0);
  });

  it('adopts a transfer whose answer was lost instead of making a second one', async () => {
    const { service, rows, connect, booking } = await setup();
    connect.dropNextTransferResponse = true;

    await expect(service.releaseDue()).resolves.toMatchObject({ inFlight: 1 });
    expect(rows.payouts[0]).toMatchObject({ status: 'transferring' });

    // The next run within the claim window leaves it alone; after it, the lookup adopts the transfer.
    await expect(service.releaseDue()).resolves.toMatchObject({ inFlight: 1 });
    (rows.payouts[0] as Payout).updatedAt = ago(CLAIM_TIMEOUT_MS + 1);
    await expect(service.releaseDue()).resolves.toMatchObject({ transferred: 1 });
    expect(connect.transfers).toHaveLength(1);
    expect(rows.payouts[0]).toMatchObject({ status: 'transferred', transferId: `tr_fake_${booking.id}_1` });
  });

  it('after a definite refusal, the next run looks up first and tries a new attempt key', async () => {
    const { service, rows, connect, logger, booking } = await setup();
    const originalCreate = connect.createTransfer.bind(connect);
    vi.spyOn(connect, 'createTransfer').mockImplementationOnce(async () => ({ kind: 'rejected', status: 400, code: 'transfers_not_allowed' }));

    await expect(service.releaseDue()).resolves.toMatchObject({ failed: 1 });
    expect(rows.payouts[0]).toMatchObject({ status: 'failed', failureCode: 'transfers_not_allowed', attempt: 2 });
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, payout: { code: 'transfers_not_allowed' } }, expect.stringMatching(/R16/));

    vi.mocked(connect.createTransfer).mockImplementation(originalCreate);
    await expect(service.releaseDue()).resolves.toMatchObject({ transferred: 1 });
    expect(connect.transfers[0]).toMatchObject({ attempt: 2 });
  });

  it('records an idempotency mismatch and a rejection without a code as failures', async () => {
    const mismatch = await setup();
    vi.spyOn(mismatch.connect, 'createTransfer').mockResolvedValueOnce({ kind: 'idempotency_mismatch' });
    await mismatch.service.releaseDue();
    expect(mismatch.rows.payouts[0]).toMatchObject({ status: 'failed', failureCode: 'idempotency_mismatch' });

    const noCode = await setup();
    vi.spyOn(noCode.connect, 'createTransfer').mockResolvedValueOnce({ kind: 'rejected', status: 402, code: null });
    await noCode.service.releaseDue();
    expect(noCode.rows.payouts[0]).toMatchObject({ failureCode: 'http_402' });
  });

  it('stays transferring when the lookup or the create gets no answer', async () => {
    const lookup = await setup();
    vi.spyOn(lookup.connect, 'findTransfer').mockResolvedValueOnce({ kind: 'retryable' });
    await expect(lookup.service.releaseDue()).resolves.toMatchObject({ inFlight: 1 });
    expect(lookup.rows.payouts[0]).toMatchObject({ status: 'transferring' });
    expect(lookup.connect.transfers).toHaveLength(0);

    const create = await setup();
    vi.spyOn(create.connect, 'createTransfer').mockResolvedValueOnce({ kind: 'misconfigured' });
    await expect(create.service.releaseDue()).resolves.toMatchObject({ inFlight: 1 });
    expect(create.logger.warn).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/stays transferring/));
  });

  it('skips a payout another run finished, or freshly claimed, between the checks and the claim', async () => {
    for (const race of [{ status: 'transferred', transferId: 'tr_other' }, { status: 'transferring' }] as const) {
      const { service, rows, em, connect, booking } = await setup();
      rows.payouts.push(
        Object.assign(new Payout(), { id: randomUUID(), booking, attempt: 1, status: 'held', holdReason: 'connect_not_enabled', netCents: 12000, currency: 'PLN', updatedAt: ago(CLAIM_TIMEOUT_MS + 1) }),
      );
      em.transactional.mockImplementationOnce(async (callback) => {
        Object.assign(rows.payouts[0] as Payout, race, { updatedAt: NOW });
        return callback(em);
      });

      await expect(service.releaseDue()).resolves.toMatchObject({ inFlight: 1 });
      expect(connect.transfers).toHaveLength(0);
    }
  });

  it('reads the stored payout after losing the creation race; other failures propagate', async () => {
    const raced = await setup();
    raced.em.transactional.mockImplementationOnce(async () => {
      raced.rows.payouts.push(Object.assign(new Payout(), { id: randomUUID(), booking: raced.booking, status: 'transferred', transferId: 'tr_won', updatedAt: NOW }));
      throw new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint: PAYOUT_BOOKING_UNIQUE }));
    });
    await expect(raced.service.releaseDue()).resolves.toMatchObject({ transferred: 0 });
    expect(raced.connect.transfers).toHaveLength(0);

    const broken = await setup();
    broken.em.transactional.mockRejectedValueOnce(new Error('db down'));
    await expect(broken.service.releaseDue()).rejects.toThrow('db down');
  });

  it(`settles at most ${RELEASE_BATCH} bookings per run and reports the rest`, async () => {
    const { service, rows } = await setup({ bookings: RELEASE_BATCH + 2 });

    await expect(service.releaseDue()).resolves.toEqual({ transferred: RELEASE_BATCH, held: 0, failed: 0, inFlight: 0, remaining: 2 });
    await expect(service.releaseDue()).resolves.toEqual({ transferred: 2, held: 0, failed: 0, inFlight: 0, remaining: 0 });
    expect(rows.payouts.every((payout) => payout.status === 'transferred')).toBe(true);
  });

  it('keeps the frozen amounts when the payout already exists', async () => {
    const { service, rows, booking } = await setup({ connected: false });
    await service.releaseDue();
    booking.feeBps = 5000;

    await service.releaseDue();
    expect(rows.payouts).toHaveLength(1);
    expect(rows.payouts[0]).toMatchObject({ feeCents: 3000, netCents: 12000 });
  });
});

describe('PayoutService.list', () => {
  it('lists payouts not yet transferred for the operator', async () => {
    const { service, rows, booking, em } = await setup({ connected: false });
    await service.releaseDue();
    (booking.mentorProfile.getEntity() as MentorProfile).displayName = null;

    await expect(service.list()).resolves.toEqual([
      {
        bookingId: booking.id,
        status: 'held',
        holdReason: 'connect_not_enabled',
        failureCode: null,
        netCents: 12000,
        feeCents: 3000,
        currency: 'PLN',
        startsAt: booking.startsAt.toISOString(),
        // #87: an operator gets the mentor's e-mail, never a blank cell.
        mentorName: 'ada@devmentor.test',
        updatedAt: NOW.toISOString(),
      },
    ]);
    expect(em.find).toHaveBeenCalledWith(Payout, { status: { $ne: 'transferred' } }, { populate: ['booking', 'mentorProfile.user'], orderBy: { updatedAt: 'desc' } });
    expect(rows.payouts).toHaveLength(1);

    (rows.payouts[0] as Payout).failureCode = 'x';
    (rows.payouts[0] as Payout).holdReason = undefined as never;
    (booking.mentorProfile.getEntity() as MentorProfile).displayName = 'Ada';
    await expect(service.list()).resolves.toMatchObject([{ holdReason: null, failureCode: 'x', mentorName: 'Ada' }]);
  });
});
