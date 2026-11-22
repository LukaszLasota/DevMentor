import { randomUUID } from 'node:crypto';
import { Booking, LockMode, MentorProfile, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { formatMoney } from '../../money/money';
import { FakeCheckoutGateway } from '../payments/fake-checkout-gateway';
import {
  BookingCancellationService,
  cancellationMails,
  NOT_CANCELLABLE_MESSAGE,
  REFUND_NOT_DUE_MESSAGE,
  TERMS_CHANGED_MESSAGE,
} from './booking-cancellation.service';
import { BOOKING_NOT_FOUND_MESSAGE } from './booking.service';

const NOW = new Date('2026-06-22T16:00:00.000Z');
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
const MENTEE_ID = randomUUID();

type Where = Record<string, unknown>;

/** Equality (a reference compared by `id`), `$in` and `$or` — what this service asks for. */
function matches(row: object, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === '$or') {
      return (expected as Where[]).some((branch) => matches(row, branch));
    }

    const actual = (row as Where)[key];
    const value = actual !== null && typeof actual === 'object' && 'id' in actual ? (actual as { id: string }).id : actual;

    if (expected !== null && typeof expected === 'object' && '$in' in expected) {
      return (expected.$in as unknown[]).includes(value);
    }

    return (value ?? null) === expected;
  });
}

function ref<T extends object>(entity: T) {
  return Object.assign(entity, { getEntity: () => entity });
}

function makeBooking(fields: Partial<Booking> = {}): Booking {
  const mentorUser = ref(Object.assign(new User(), { id: randomUUID(), email: 'ada@devmentor.test' }));
  const profile = ref(Object.assign(new MentorProfile(), { id: randomUUID(), user: mentorUser, displayName: 'Ada', slug: 'ada' }));

  return Object.assign(new Booking(), {
    id: randomUUID(),
    mentorProfile: profile,
    mentee: ref(Object.assign(new User(), { id: MENTEE_ID, email: 'mentee@devmentor.test' })),
    startsAt: hoursFromNow(48),
    lengthMinutes: 25,
    priceCents: 15000,
    currency: 'PLN',
    status: 'confirmed',
    checkoutSessionId: null,
    refundStatus: null,
    refundId: null,
    cancelledAt: null,
    ...fields,
  });
}

/** A paid fake session for `booking`, so the gateway can refund it. */
async function paid(gateway: FakeCheckoutGateway, booking: Booking): Promise<void> {
  const { data } = (await gateway.createSession({
    bookingId: booking.id,
    amountCents: booking.priceCents,
    currency: booking.currency,
    productName: 'x',
    expiresAt: hoursFromNow(1),
    successUrl: 's',
    cancelUrl: 'c',
  })) as { data: { id: string } };
  gateway.complete(data.id);
  booking.checkoutSessionId = data.id;
}

async function setup(fields: Partial<Booking> = {}, { pay = true, appUrl = 'https://app.devmentor.test' as string | null } = {}) {
  const booking = makeBooking(fields);
  const bookings = [booking];
  const profiles = [booking.mentorProfile as unknown as MentorProfile];
  const gateway = new FakeCheckoutGateway();

  if (pay) {
    await paid(gateway, booking);
  }

  const table = (entity: unknown): object[] => (entity === Booking ? bookings : profiles);
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Where) => table(entity).find((row) => matches(row, where)) ?? null),
    find: vi.fn(async (entity: unknown, where: Where) => table(entity).filter((row) => matches(row, where))),
    nativeUpdate: vi.fn(async (_entity: unknown, where: Where, data: Partial<Booking>) => {
      const rows = bookings.filter((row) => matches(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return rows.length;
    }),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => callback(em)),
  };
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const events = { emit: vi.fn(async () => undefined) };
  const mailSender = { send: vi.fn<(message: { to: string; subject: string; text: string }) => Promise<void>>(async () => undefined) };
  const bookingService = { getOwn: vi.fn(async (menteeId: string, id: string) => ({ id, menteeId, view: true })) };
  const service = new BookingCancellationService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', APP_URL: appUrl ?? '' }),
    logger: logger as unknown as Cradle['logger'],
    checkoutGateway: gateway,
    events: events as unknown as Cradle['events'],
    mailSender,
    bookingService: bookingService as unknown as Cradle['bookingService'],
  });

  return { service, booking, bookings, gateway, em, logger, events, mailSender, bookingService };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('BookingCancellationService.cancel', () => {
  it('cancels more than 24 hours ahead under the profile lock, refunds in full and announces it (AC1, AC4)', async () => {
    const { service, booking, gateway, em, events, mailSender, bookingService } = await setup();

    const view = await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });

    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { id: booking.mentorProfile.id }, LOCK);
    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id }, LOCK);
    expect(booking).toMatchObject({ status: 'cancelled', cancelledAt: NOW, refundStatus: 'succeeded', refundId: `re_fake_${booking.id}` });
    expect([...gateway.refunds.values()]).toEqual([{ id: `re_fake_${booking.id}`, status: 'succeeded', sessionId: booking.checkoutSessionId }]);
    expect(events.emit).toHaveBeenCalledWith('bookings.booking.cancelled', {
      bookingId: booking.id,
      mentorProfileId: booking.mentorProfile.id,
      menteeId: MENTEE_ID,
      startsAt: booking.startsAt,
      refundDue: true,
    });
    expect(mailSender.send.mock.calls.map(([message]) => message.to)).toEqual(['mentee@devmentor.test', 'ada@devmentor.test']);
    expect(view).toEqual({ id: booking.id, menteeId: MENTEE_ID, view: true });
    expect(bookingService.getOwn).toHaveBeenCalledWith(MENTEE_ID, booking.id);
  });

  it('cancels 24 hours or less ahead without a refund once the mentee accepted the forfeit (AC2)', async () => {
    const { service, booking, gateway, events } = await setup({ startsAt: hoursFromNow(24) });

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: false });

    expect(booking).toMatchObject({ status: 'cancelled', refundStatus: 'not_due', refundId: null });
    expect(gateway.refunds.size).toBe(0);
    expect(events.emit).toHaveBeenCalledWith('bookings.booking.cancelled', expect.objectContaining({ refundDue: false }));
  });

  it.each([
    ['free, but the page showed a forfeit', 48, false],
    ['forfeited, but the page showed a refund', 10, true],
  ])('refuses changed terms (%s) and changes nothing', async (_case, hours, expectRefund) => {
    const { service, booking, gateway } = await setup({ startsAt: hoursFromNow(hours) });

    expect(await rejection(service.cancel(MENTEE_ID, booking.id, { expectRefund }))).toMatchObject({
      status: 409,
      code: 'CANCELLATION_TERMS_CHANGED',
      message: TERMS_CHANGED_MESSAGE,
    });
    expect(booking.status).toBe('confirmed');
    expect(gateway.refunds.size).toBe(0);
  });

  it.each([
    ['a held booking', { status: 'pending_payment' as const }],
    ['an expired one', { status: 'expired' as const }],
    ['one that has started', { startsAt: NOW }],
  ])('refuses %s with NOT_CANCELLABLE', async (_case, fields) => {
    const { service, booking } = await setup(fields);

    expect(await rejection(service.cancel(MENTEE_ID, booking.id, { expectRefund: false }))).toMatchObject({
      status: 409,
      code: 'NOT_CANCELLABLE',
      message: NOT_CANCELLABLE_MESSAGE,
    });
  });

  it('answers 404 for another mentee\'s booking or an unknown id', async () => {
    const { service, booking } = await setup();

    expect(await rejection(service.cancel(randomUUID(), booking.id, { expectRefund: true }))).toMatchObject({
      status: 404,
      message: BOOKING_NOT_FOUND_MESSAGE,
    });
    expect(await rejection(service.cancel(MENTEE_ID, randomUUID(), { expectRefund: true }))).toMatchObject({ status: 404 });
  });

  it('is idempotent: a repeat returns the view, announces nothing again and never refunds twice', async () => {
    const { service, booking, gateway, events, mailSender } = await setup();

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });
    await service.cancel(MENTEE_ID, booking.id, { expectRefund: false });

    expect(gateway.refunds.size).toBe(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledTimes(2);
  });

  it('keeps a refund Stripe may have taken `requested` (timeout), and a repeat cancel retries it with the same key', async () => {
    const { service, booking, gateway, logger } = await setup();
    gateway.nextFailure = { kind: 'retryable' };

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });
    expect(booking).toMatchObject({ status: 'cancelled', refundStatus: 'requested', refundId: null });
    expect(logger.warn).toHaveBeenCalledWith({ booking: { id: booking.id }, refund: { kind: 'retryable' } }, expect.stringMatching(/stays requested/));

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });
    expect(booking).toMatchObject({ refundStatus: 'succeeded', refundId: `re_fake_${booking.id}` });
  });

  it.each([
    ['a refusal', { kind: 'rejected' as const, status: 400, code: 'charge_disputed' }],
    ['an idempotency mismatch', { kind: 'idempotency_mismatch' as const }],
  ])('marks %s failed for the operator; the cancellation stands', async (_case, failure) => {
    const { service, booking, gateway, logger } = await setup();
    gateway.nextFailure = failure;

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });

    expect(booking).toMatchObject({ status: 'cancelled', refundStatus: 'failed' });
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, refund: failure }, expect.stringMatching(/operator/));
  });

  it('records a pending refund and keeps an earlier refund id when Stripe says the charge was already refunded', async () => {
    const pending = await setup();
    pending.gateway.nextRefundStatus = 'pending';
    await pending.service.cancel(MENTEE_ID, pending.booking.id, { expectRefund: true });
    expect(pending.booking).toMatchObject({ refundStatus: 'pending', refundId: `re_fake_${pending.booking.id}` });

    const already = await setup({ status: 'cancelled', cancelledAt: NOW, refundStatus: 'requested', refundId: 're_earlier' });
    vi.spyOn(already.gateway, 'refund').mockResolvedValueOnce({ kind: 'ok', data: { id: null, status: 'succeeded' } });
    await already.service.cancel(MENTEE_ID, already.booking.id, { expectRefund: true });
    expect(already.booking).toMatchObject({ refundStatus: 'succeeded', refundId: 're_earlier' });

    const none = await setup({ status: 'cancelled', cancelledAt: NOW, refundStatus: 'requested' });
    vi.spyOn(none.gateway, 'refund').mockResolvedValueOnce({ kind: 'ok', data: { id: null, status: 'succeeded' } });
    await none.service.cancel(MENTEE_ID, none.booking.id, { expectRefund: true });
    expect(none.booking).toMatchObject({ refundStatus: 'succeeded', refundId: null });
  });

  it('keeps the cancellation when an email fails', async () => {
    const { service, booking, mailSender, logger } = await setup();
    mailSender.send.mockRejectedValueOnce(new Error('smtp down'));

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });

    expect(booking.status).toBe('cancelled');
    expect(mailSender.send).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, err: expect.any(Error) }, 'Booking cancellation email failed');
  });

  it('builds links without APP_URL', async () => {
    const { service, booking, mailSender } = await setup({}, { appUrl: null });

    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });

    expect(mailSender.send.mock.calls[0]?.[0].text).toContain(`\n/bookings/${booking.id}`);
  });
});

describe('BookingCancellationService.retryRefund', () => {
  it('asks Stripe again for a requested or failed refund', async () => {
    for (const refundStatus of ['requested', 'failed'] as const) {
      const { service, booking } = await setup({ status: 'cancelled', cancelledAt: NOW, refundStatus });

      await expect(service.retryRefund(booking.id)).resolves.toEqual({ refundStatus: 'succeeded' });
      expect(booking.refundId).toBe(`re_fake_${booking.id}`);
    }
  });

  it('re-reads a pending refund and records where it settled; a failed read changes nothing', async () => {
    const { service, booking, gateway } = await setup();
    gateway.nextRefundStatus = 'pending';
    await service.cancel(MENTEE_ID, booking.id, { expectRefund: true });
    gateway.refunds.get(booking.id)!.status = 'succeeded';

    gateway.nextFailure = { kind: 'retryable' };
    await expect(service.retryRefund(booking.id)).resolves.toEqual({ refundStatus: 'pending' });
    await expect(service.retryRefund(booking.id)).resolves.toEqual({ refundStatus: 'succeeded' });
  });

  it.each([
    ['a confirmed booking', { status: 'confirmed' as const }],
    ['a refunded one', { status: 'cancelled' as const, cancelledAt: NOW, refundStatus: 'succeeded' as const }],
    ['a forfeited one', { status: 'cancelled' as const, cancelledAt: NOW, refundStatus: 'not_due' as const }],
  ])('refuses %s with REFUND_NOT_DUE', async (_case, fields) => {
    const { service, booking } = await setup(fields);

    expect(await rejection(service.retryRefund(booking.id))).toMatchObject({ status: 409, code: 'REFUND_NOT_DUE', message: REFUND_NOT_DUE_MESSAGE });
  });

  it('answers 404 for an unknown booking', async () => {
    const { service } = await setup();

    expect(await rejection(service.retryRefund(randomUUID()))).toMatchObject({ status: 404 });
  });
});

describe('BookingCancellationService.needsAttention', () => {
  it('lists open refunds and orphaned payments with who and what, oldest start first', async () => {
    const { service, booking, em } = await setup({ status: 'cancelled', cancelledAt: NOW, refundStatus: 'failed', refundId: 're_1' });

    await expect(service.needsAttention()).resolves.toEqual([
      {
        bookingId: booking.id,
        status: 'cancelled',
        refundStatus: 'failed',
        refundId: 're_1',
        checkoutSessionId: booking.checkoutSessionId,
        priceCents: 15000,
        currency: 'PLN',
        startsAt: booking.startsAt.toISOString(),
        cancelledAt: NOW.toISOString(),
        menteeEmail: 'mentee@devmentor.test',
        mentorName: 'Ada',
      },
    ]);
    expect(em.find).toHaveBeenCalledWith(
      Booking,
      { $or: [{ status: 'cancelled', refundStatus: { $in: ['requested', 'pending', 'failed'] } }, { status: 'payment_orphaned' }] },
      { populate: ['mentorProfile.user', 'mentee'], orderBy: { startsAt: 'asc' } },
    );
  });

  it('shows an orphaned payment with blank refund fields and leaves settled bookings out', async () => {
    const orphan = await setup({ status: 'payment_orphaned' }, { pay: false });
    (orphan.booking.mentorProfile as unknown as MentorProfile).displayName = null;
    await expect(orphan.service.needsAttention()).resolves.toEqual([
      expect.objectContaining({ status: 'payment_orphaned', refundStatus: null, refundId: null, checkoutSessionId: null, cancelledAt: null, mentorName: 'ada@devmentor.test' }),
    ]);

    const settled = await setup({ status: 'cancelled', cancelledAt: NOW, refundStatus: 'succeeded' });
    await expect(settled.service.needsAttention()).resolves.toEqual([]);
  });
});

describe('cancellationMails', () => {
  it('tells the mentee about the refund or the forfeit, and the mentor that the time is open', () => {
    const refunded = makeBooking({ startsAt: new Date('2026-06-24T09:00:00.000Z'), refundStatus: 'requested' });
    const [mentee, mentor] = cancellationMails(refunded, 'https://app.test');

    expect(mentee).toEqual({
      to: 'mentee@devmentor.test',
      subject: 'Cancelled: 25-minute session with Ada',
      text: `You cancelled your 25-minute text session on 2026-06-24 09:00 UTC.\n\nYour ${formatMoney(15000, 'PLN')} is being refunded in full to your card (usually 5–10 days).\n\nhttps://app.test/bookings/${refunded.id}`,
    });
    expect(mentor).toEqual({
      to: 'ada@devmentor.test',
      subject: 'Cancelled: 25-minute session on 2026-06-24 09:00 UTC',
      text: 'The mentee cancelled the 25-minute text session on 2026-06-24 09:00 UTC. The time is open for booking again while it is at least two hours away.\n\nhttps://app.test/mentor/slots',
    });

    const forfeited = makeBooking({ refundStatus: 'not_due' });
    (forfeited.mentorProfile as unknown as MentorProfile).displayName = null;
    const [late] = cancellationMails(forfeited, '');
    expect(late?.subject).toBe('Cancelled: 25-minute session with your mentor');
    // #87: a blank name is as missing as a null one.
    (forfeited.mentorProfile as unknown as MentorProfile).displayName = '  ';
    expect(cancellationMails(forfeited, '')[0]?.subject).toBe('Cancelled: 25-minute session with your mentor');
    expect(late?.text).toContain(`The ${formatMoney(15000, 'PLN')} fee is not refunded: the booking was cancelled 24 hours or less before the start.`);
    expect(late?.text).not.toMatch(/respond|reply within|guarantee/i);
  });
});
