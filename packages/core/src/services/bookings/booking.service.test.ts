import { randomUUID } from 'node:crypto';
import { ACTIVE_BOOKING_SLOT_UNIQUE, Booking, BookingReport, LockMode, MentorProfile, Slot, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import type { PlatformSettings } from '../operator/platform-settings.service';
import type { CheckoutSession } from '../payments/checkout-gateway';
import { FakeCheckoutGateway } from '../payments/fake-checkout-gateway';
import {
  BOOKING_NOT_FOUND_MESSAGE,
  confirmationMails,
  BookingService,
  CHECKOUT_LIFETIME_MS,
  HOLD_GRACE_MS,
  HOLD_IN_PROGRESS_MESSAGE,
  NOT_BOOKABLE_MESSAGE,
  OWN_SLOT_MESSAGE,
  PAYMENTS_UNAVAILABLE_MESSAGE,
  SLOT_NOT_FOUND_MESSAGE,
  SLOT_TAKEN_MESSAGE,
} from './booking.service';

const NOW = new Date('2026-06-22T16:00:00.000Z');
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
const SETTINGS: PlatformSettings = {
  currency: 'PLN',
  bounds: { '25': { minCents: 5000, maxCents: 30000 }, '50': { minCents: 10000, maxCents: 60000 } },
} as PlatformSettings;
const MENTEE = { id: randomUUID(), email: 'mentee@devmentor.test' };

type Where = Record<string, unknown>;

/** Equality, `$gt`/`$lte` on dates, `$in`, `$or`, and an id compared with a reference's `id`. */
function matches(row: object, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as Where)[key];

    if (key === '$or') {
      return (expected as Where[]).some((branch) => matches(row, branch));
    }

    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const range = expected as { $gt?: Date; $lt?: Date; $lte?: Date; $in?: string[]; $ne?: string };

      if (range.$in) {
        return range.$in.includes((actual as { id: string }).id);
      }

      if (range.$ne !== undefined) {
        return actual !== range.$ne;
      }

      const time = (actual as Date).getTime();

      return (
        (range.$gt === undefined || time > range.$gt.getTime()) &&
        (range.$lt === undefined || time < range.$lt.getTime()) &&
        (range.$lte === undefined || time <= range.$lte.getTime())
      );
    }

    if (typeof expected === 'string' && actual !== null && typeof actual === 'object' && 'id' in actual) {
      return (actual as { id: string }).id === expected;
    }

    return (actual ?? null) === expected;
  });
}

function ref<T extends { id: string }>(entity: T) {
  return Object.assign(entity, { getEntity: () => entity });
}

function makeMentor(fields: Partial<MentorProfile> = {}, roles: User['roles'] = ['mentee', 'mentor']) {
  const user = ref(Object.assign(new User(), { id: randomUUID(), roles }));

  return ref(
    Object.assign(new MentorProfile(), {
      id: randomUUID(),
      user,
      displayName: 'Ada',
      slug: 'ada',
      publishedAt: hoursFromNow(-48),
      price25Cents: 15000,
      price50Cents: 30000,
      ...fields,
    }),
  );
}

function makeSlot(profile: MentorProfile, startsAt: Date, removedAt: Date | null = null): Slot {
  return Object.assign(new Slot(), { id: randomUUID(), mentorProfile: profile, startsAt, removedAt });
}

function makeBooking(slot: Slot, fields: Partial<Booking> = {}): Booking {
  return Object.assign(new Booking(), {
    id: randomUUID(),
    slot,
    mentorProfile: ref(slot.mentorProfile as unknown as MentorProfile),
    mentee: { id: MENTEE.id },
    startsAt: slot.startsAt,
    endsAt: new Date(slot.startsAt.getTime() + 25 * 60_000),
    lengthMinutes: 25,
    priceCents: 15000,
    currency: 'PLN',
    status: 'pending_payment',
    holdExpiresAt: hoursFromNow(0.5),
    checkoutSessionId: null,
    ...fields,
  });
}

/**
 * In-memory `EntityManager`: `transactional` commits created bookings and enforces the partial unique
 * index on one active booking per slot like PostgreSQL would.
 */
function fakeEm(profiles: MentorProfile[], slots: Slot[], bookings: Booking[]) {
  let pending: Booking[] = [];
  const table = (entity: unknown): object[] => (entity === Slot ? slots : entity === Booking ? bookings : profiles);
  const em = {
    findOne: vi.fn<(entity: unknown, where: Where, options?: object) => Promise<object | null>>(
      async (entity, where) => table(entity).find((row) => matches(row, where)) ?? null,
    ),
    find: vi.fn(async (entity: unknown, where: Where) => table(entity).filter((row) => matches(row, where))),
    count: vi.fn(async (entity: unknown, where: Where) => table(entity).filter((row) => matches(row, where)).length),
    create: vi.fn((_entity: unknown, data: Partial<Booking>) => {
      const booking = Object.assign(new Booking(), { id: randomUUID(), checkoutSessionId: null, ...data }, { mentee: { id: data.mentee } });
      pending.push(booking);
      return booking;
    }),
    clear: vi.fn(),
    nativeUpdate: vi.fn(async (_entity: unknown, where: Where, data: Partial<Booking>) => {
      const rows = bookings.filter((row) => matches(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return rows.length;
    }),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      pending = [];
      const result = await callback(em);
      for (const booking of pending) {
        const clash = bookings.some(
          (row) => row.slot.id === booking.slot.id && (row.status === 'pending_payment' || row.status === 'confirmed'),
        );
        if (clash) {
          throw new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint: ACTIVE_BOOKING_SLOT_UNIQUE }));
        }
      }
      bookings.push(...pending);
      return result;
    }),
  };

  return em;
}

function setup({
  profiles = [] as MentorProfile[],
  slots = [] as Slot[],
  bookings = [] as Booking[],
  settings = SETTINGS as PlatformSettings | null,
  bookable = 1,
  appUrl = 'https://app.devmentor.test' as string | null,
} = {}) {
  const em = fakeEm(profiles, slots, bookings);
  const gateway = new FakeCheckoutGateway();
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const slotService = { countBookable: vi.fn(async () => bookable) };
  const events = { emit: vi.fn(async () => undefined) };
  const mailSender = { send: vi.fn<(message: { to: string }) => Promise<void>>(async () => undefined) };
  const service = new BookingService({
    events: events as unknown as Cradle['events'],
    mailSender,
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', APP_URL: appUrl ?? '' }),
    logger: logger as unknown as Cradle['logger'],
    slotService: slotService as unknown as Cradle['slotService'],
    platformSettingsService: { tryGet: () => settings } as unknown as Cradle['platformSettingsService'],
    checkoutGateway: gateway,
  });

  return { service, em, gateway, logger, bookings, slotService, events, mailSender };
}

function bookableMentor(startsAt = hoursFromNow(24)) {
  const profile = makeMentor();
  const slot = makeSlot(profile, startsAt);

  return { profile, slot };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

const session = (booking: Booking, fields: Partial<CheckoutSession> = {}): CheckoutSession => ({
  id: `cs_${booking.id}`,
  url: null,
  status: 'complete',
  paymentStatus: 'paid',
  expiresAt: hoursFromNow(0.5),
  clientReferenceId: booking.id,
  amountTotal: booking.priceCents,
  currency: booking.currency,
  paymentIntentId: `pi_${booking.id}`,
  ...fields,
});

describe('BookingService.start', () => {
  it('keeps one hold per mentee: a new Book releases their earlier unpaid hold through Stripe first', async () => {
    const { profile, slot } = bookableMentor();
    const other = makeSlot(profile, hoursFromNow(30));
    const { service, gateway, bookings, em } = setup({ profiles: [profile], slots: [slot, other] });

    const first = await service.start(MENTEE, { slotId: slot.id, length: '25' });
    await service.start(MENTEE, { slotId: other.id, length: '25' });

    expect(bookings.find((booking) => booking.id === first.bookingId)?.status).toBe('expired');
    expect(gateway.sessions.get(`cs_fake_${first.bookingId}`)?.status).toBe('expired');
    expect(bookings.filter((booking) => booking.status === 'pending_payment')).toHaveLength(1);
    expect(em.findOne).toHaveBeenCalledWith(User, { id: MENTEE.id }, LOCK);
  });

  it('refuses a second hold that appeared after the release (another tab) with HOLD_IN_PROGRESS', async () => {
    const { profile, slot } = bookableMentor();
    const { service, em, gateway } = setup({ profiles: [profile], slots: [slot] });
    em.count.mockResolvedValueOnce(1);

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({
      status: 409,
      code: 'HOLD_IN_PROGRESS',
      message: HOLD_IN_PROGRESS_MESSAGE,
    });
    expect(gateway.created).toHaveLength(0);
  });

  it('holds the slot under the profile lock with the server-held price, then opens Checkout at one deadline', async () => {
    const { profile, slot } = bookableMentor();
    const { service, em, gateway, bookings } = setup({ profiles: [profile], slots: [slot] });

    const started = await service.start(MENTEE, { slotId: slot.id, length: '50' });

    const [booking] = bookings;
    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { id: profile.id }, { ...LOCK, populate: ['user'] });
    expect(booking).toMatchObject({
      slot,
      mentorProfile: profile,
      mentee: { id: MENTEE.id },
      startsAt: slot.startsAt,
      endsAt: new Date(slot.startsAt.getTime() + 50 * 60_000),
      lengthMinutes: 50,
      priceCents: 30000,
      currency: 'PLN',
      status: 'pending_payment',
      holdExpiresAt: new Date(NOW.getTime() + CHECKOUT_LIFETIME_MS + HOLD_GRACE_MS),
      checkoutSessionId: `cs_fake_${booking?.id}`,
    });
    expect(gateway.created).toEqual([
      {
        bookingId: booking?.id,
        amountCents: 30000,
        currency: 'PLN',
        productName: '50-minute text session with Ada',
        customerEmail: MENTEE.email,
        expiresAt: new Date(NOW.getTime() + CHECKOUT_LIFETIME_MS),
        successUrl: `https://app.devmentor.test/bookings/${booking?.id}`,
        cancelUrl: `https://app.devmentor.test/m/ada?checkout=cancelled&booking=${booking?.id}`,
      },
    ]);
    expect(started).toEqual({ bookingId: booking?.id, checkoutUrl: `https://checkout.fake.test/cs_fake_${booking?.id}` });
  });

  it('lets two mentees race for one time: the second is refused before any Checkout (AC4)', async () => {
    const { profile, slot } = bookableMentor();
    const { service, gateway, slotService } = setup({ profiles: [profile], slots: [slot] });

    await service.start(MENTEE, { slotId: slot.id, length: '25' });
    // The held time was the mentor's only one: they now have no free time, yet the rival hears SLOT_TAKEN.
    slotService.countBookable.mockResolvedValue(0);
    const second = await rejection(service.start({ id: randomUUID(), email: 'b@devmentor.test' }, { slotId: slot.id, length: '25' }));

    expect(second).toMatchObject({ status: 409, code: 'SLOT_TAKEN', message: SLOT_TAKEN_MESSAGE });
    expect(gateway.created).toHaveLength(1);
  });

  it('maps a hold the lock could not see (the unique index) to SLOT_TAKEN; other failures propagate', async () => {
    const { profile, slot } = bookableMentor();
    const { service, em } = setup({ profiles: [profile], slots: [slot] });
    em.transactional.mockRejectedValueOnce(
      new UniqueConstraintViolationException(Object.assign(new Error('dup'), { constraint: ACTIVE_BOOKING_SLOT_UNIQUE })),
    );
    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'SLOT_TAKEN' });

    em.transactional.mockRejectedValueOnce(new Error('db down'));
    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ message: 'db down' });
  });

  it('refuses a length that overlaps another booking of the mentor, but offers the shorter one', async () => {
    const { profile, slot } = bookableMentor();
    const later = makeSlot(profile, new Date(slot.startsAt.getTime() + 30 * 60_000));
    const { service } = setup({ profiles: [profile], slots: [slot, later], bookings: [makeBooking(later, { status: 'confirmed' })] });

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '50' }))).toMatchObject({ code: 'SLOT_TAKEN' });
    await expect(service.start(MENTEE, { slotId: slot.id, length: '25' })).resolves.toMatchObject({ checkoutUrl: expect.any(String) });
  });

  it.each([
    ['Stripe is not configured', { configured: false }],
    ['APP_URL is missing', { appUrl: null }],
  ])('answers 503 PAYMENTS_UNAVAILABLE when %s, holding nothing', async (_case, options) => {
    const { profile, slot } = bookableMentor();
    const { service, gateway, bookings } = setup({ profiles: [profile], slots: [slot], ...('appUrl' in options ? options : {}) });
    gateway.configured = !('configured' in options);

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({
      status: 503,
      code: 'PAYMENTS_UNAVAILABLE',
      message: PAYMENTS_UNAVAILABLE_MESSAGE,
    });
    expect(bookings).toHaveLength(0);
  });

  it.each([
    ['retryable', { kind: 'retryable' } as const],
    ['misconfigured', { kind: 'misconfigured' } as const],
  ])('marks the hold failed (time released) when Checkout answers %s, and answers 503', async (_case, failure) => {
    const { profile, slot } = bookableMentor();
    const { service, gateway, bookings, logger } = setup({ profiles: [profile], slots: [slot] });
    gateway.nextFailure = failure;

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' });
    expect(bookings[0]?.status).toBe('failed');
    expect(logger.warn).toHaveBeenCalledWith({ booking: { id: bookings[0]?.id }, checkout: failure.kind }, expect.any(String));
  });

  it('treats a session without a payment page as a failure', async () => {
    const { profile, slot } = bookableMentor();
    const { service, gateway, bookings } = setup({ profiles: [profile], slots: [slot] });
    vi.spyOn(gateway, 'createSession').mockResolvedValueOnce({ kind: 'ok', data: session(makeBooking(slot), { status: 'open', url: null }) });

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' });
    expect(bookings[0]?.status).toBe('failed');
  });

  it.each([
    ['an unknown slot', 'unknown'],
    ['a removed slot', 'removed'],
    ['a mentor who lost the mentor role', 'role'],
    ['a slot removed after the first read', 'raced'],
  ])('answers 404 for %s', async (_case, kind) => {
    const profile = makeMentor({}, kind === 'role' ? ['mentee'] : ['mentee', 'mentor']);
    const slot = makeSlot(profile, hoursFromNow(24), kind === 'removed' ? NOW : null);
    const { service, em } = setup({ profiles: [profile], slots: [slot] });
    if (kind === 'raced') {
      em.findOne.mockImplementationOnce(async () => slot).mockImplementationOnce(async () => profile).mockImplementationOnce(async () => null);
    }

    const slotId = kind === 'unknown' ? randomUUID() : slot.id;

    expect(await rejection(service.start(MENTEE, { slotId, length: '25' }))).toMatchObject({ status: 404, message: SLOT_NOT_FOUND_MESSAGE });
  });

  it('answers 404 when the profile vanished between the reads', async () => {
    const { profile, slot } = bookableMentor();
    const { service, em } = setup({ profiles: [profile], slots: [slot] });
    // The slot, then the mentee's row lock, then the profile (gone).
    em.findOne.mockImplementationOnce(async () => slot).mockImplementationOnce(async () => null).mockImplementationOnce(async () => null);

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ status: 404 });
  });

  it('refuses the mentor booking their own time with 403', async () => {
    const { profile, slot } = bookableMentor();
    const { service } = setup({ profiles: [profile], slots: [slot] });

    expect(await rejection(service.start({ id: profile.user.id, email: 'ada@devmentor.test' }, { slotId: slot.id, length: '25' }))).toMatchObject({
      status: 403,
      message: OWN_SLOT_MESSAGE,
    });
  });

  it.each([
    ['the slot is under two hours away', { startsAt: hoursFromNow(1.9) }],
    ['settings are missing', { settings: null }],
    ['the mentor is not offer-ready', { bookable: 0 }],
  ] as [string, { startsAt?: Date; settings?: null; bookable?: number }][])('answers 409 NOT_BOOKABLE when %s', async (_case, options) => {
    const { profile, slot } = bookableMentor(options.startsAt);
    const { service } = setup({ profiles: [profile], slots: [slot], ...options });

    expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({
      status: 409,
      code: 'NOT_BOOKABLE',
      message: NOT_BOOKABLE_MESSAGE,
    });
  });

  describe('a stale hold in the way', () => {
    const stale = (slot: Slot, fields: Partial<Booking> = {}) =>
      makeBooking(slot, { holdExpiresAt: hoursFromNow(-0.1), checkoutSessionId: 'cs_stale', ...fields });

    it('is released after Stripe expires its session, and the new hold proceeds', async () => {
      const { profile, slot } = bookableMentor();
      const old = stale(slot);
      const { service, gateway, bookings } = setup({ profiles: [profile], slots: [slot], bookings: [old] });
      const expire = vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce({ kind: 'ok', data: session(old, { status: 'expired', paymentStatus: 'unpaid' }) });

      await service.start(MENTEE, { slotId: slot.id, length: '25' });

      expect(expire).toHaveBeenCalledWith('cs_stale');
      expect(old.status).toBe('expired');
      expect(bookings.filter((row) => row.status === 'pending_payment')).toHaveLength(1);
    });

    it('is confirmed and announced instead when Stripe reports it paid (a late webhook), and the time stays taken', async () => {
      const { profile, slot } = bookableMentor();
      (profile.user as unknown as User).email = 'ada@devmentor.test';
      const mentee = ref(Object.assign(new User(), { id: MENTEE.id, email: MENTEE.email }));
      const old = stale(slot, { mentee: mentee as unknown as Booking['mentee'] });
      const { service, gateway, events, mailSender, em } = setup({ profiles: [profile], slots: [slot], bookings: [old] });
      vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce({ kind: 'ok', data: session(old) });

      expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'SLOT_TAKEN' });
      expect(old).toMatchObject({ status: 'confirmed', confirmedAt: NOW });
      expect(gateway.created).toHaveLength(0);
      expect(em.clear).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith('bookings.booking.confirmed', expect.objectContaining({ bookingId: old.id }));
      expect(mailSender.send).toHaveBeenCalledTimes(2);
    });

    it('does not announce a stale payment that is orphaned', async () => {
      const { profile, slot } = bookableMentor();
      const old = stale(slot);
      const { service, gateway, events } = setup({ profiles: [profile], slots: [slot], bookings: [old] });
      vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce({ kind: 'ok', data: session(old, { amountTotal: 1 }) });

      expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'SLOT_TAKEN' });
      expect(old.status).toBe('payment_orphaned');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('releases an expired hold on another slot that overlaps the wanted time, through Stripe, before holding', async () => {
      const { profile, slot } = bookableMentor();
      const earlier = makeSlot(profile, new Date(slot.startsAt.getTime() - 30 * 60_000));
      const unrelated = makeSlot(profile, new Date(slot.startsAt.getTime() + 3 * 3_600_000));
      const overlapping = makeBooking(earlier, {
        endsAt: new Date(earlier.startsAt.getTime() + 50 * 60_000),
        lengthMinutes: 50,
        holdExpiresAt: hoursFromNow(-0.1),
        checkoutSessionId: 'cs_overlap',
      });
      const far = makeBooking(unrelated, { holdExpiresAt: hoursFromNow(-0.1), checkoutSessionId: 'cs_far' });
      const { service, gateway } = setup({ profiles: [profile], slots: [slot, earlier, unrelated], bookings: [overlapping, far] });
      const expire = vi
        .spyOn(gateway, 'expireSession')
        .mockResolvedValueOnce({ kind: 'ok', data: session(overlapping, { status: 'expired', paymentStatus: 'unpaid' }) });

      await expect(service.start(MENTEE, { slotId: slot.id, length: '25' })).resolves.toMatchObject({ checkoutUrl: expect.any(String) });

      expect(expire).toHaveBeenCalledExactlyOnceWith('cs_overlap');
      expect(overlapping.status).toBe('expired');
      expect(far.status).toBe('pending_payment');
    });

    it.each([
      ['Stripe cannot answer', 'retryable'],
      ['the session is still open', 'open'],
    ] as const)('keeps the time taken when %s', async (_case, answer) => {
      const { profile, slot } = bookableMentor();
      const old = stale(slot);
      const { service, gateway } = setup({ profiles: [profile], slots: [slot], bookings: [old] });
      vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce(
        answer === 'open' ? { kind: 'ok', data: session(old, { status: 'open', paymentStatus: 'unpaid' }) } : { kind: 'retryable' },
      );

      expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'SLOT_TAKEN' });
      expect(old.status).toBe('pending_payment');
    });

    it('is expired without calling Stripe when Checkout never opened for it', async () => {
      const { profile, slot } = bookableMentor();
      const old = stale(slot, { checkoutSessionId: null });
      const { service, gateway } = setup({ profiles: [profile], slots: [slot], bookings: [old] });
      const expire = vi.spyOn(gateway, 'expireSession');

      await service.start(MENTEE, { slotId: slot.id, length: '25' });

      expect(expire).not.toHaveBeenCalled();
      expect(old.status).toBe('expired');
    });

    it('answers SLOT_TAKEN when another stale hold appears on the retry', async () => {
      const { profile, slot } = bookableMentor();
      const old = stale(slot, { checkoutSessionId: null });
      const { service, em } = setup({ profiles: [profile], slots: [slot], bookings: [old] });
      // The release does not take effect (another writer re-held it in between).
      em.nativeUpdate.mockResolvedValueOnce(0);

      expect(await rejection(service.start(MENTEE, { slotId: slot.id, length: '25' }))).toMatchObject({ code: 'SLOT_TAKEN' });
    });
  });
});

describe('BookingService.applyCompleted / applyExpired', () => {
  function held(fields: Partial<Booking> = {}) {
    const { profile, slot } = bookableMentor();
    const booking = makeBooking(slot, fields);
    const { service, em, logger } = setup({ profiles: [profile], slots: [slot], bookings: [booking] });

    return { service, em, logger, booking, slot };
  }

  it('confirms a paid hold, records the lead to the start (R09) and the session id', async () => {
    const { service, em, booking } = held();

    await expect(service.applyCompleted(em as unknown as Cradle['em'], session(booking))).resolves.toEqual({ outcome: 'confirmed', booking });
    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { id: booking.mentorProfile.id }, LOCK);
    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id }, LOCK);
    expect(booking).toMatchObject({ status: 'confirmed', confirmedAt: NOW, leadMinutes: 24 * 60, checkoutSessionId: `cs_${booking.id}`, feeBps: 2000 });
  });

  it('is idempotent for a confirmed booking and leaves an orphaned one alone', async () => {
    const confirmed = held({ status: 'confirmed', confirmedAt: hoursFromNow(-1), leadMinutes: 1500 });
    await expect(confirmed.service.applyCompleted(confirmed.em as unknown as Cradle['em'], session(confirmed.booking))).resolves.toMatchObject({
      outcome: 'already_confirmed',
    });
    expect(confirmed.booking).toMatchObject({ confirmedAt: hoursFromNow(-1), leadMinutes: 1500 });

    const orphan = held({ status: 'payment_orphaned' });
    await expect(orphan.service.applyCompleted(orphan.em as unknown as Cradle['em'], session(orphan.booking))).resolves.toMatchObject({
      outcome: 'orphaned',
    });
  });

  it('ignores a redelivered completion for a cancelled booking (never orphaned, so never refunded twice)', async () => {
    const cancelled = held({ status: 'cancelled', confirmedAt: hoursFromNow(-1), leadMinutes: 1500, refundStatus: 'succeeded' });

    await expect(cancelled.service.applyCompleted(cancelled.em as unknown as Cradle['em'], session(cancelled.booking))).resolves.toEqual({
      outcome: 'ignored',
      booking: cancelled.booking,
    });
    expect(cancelled.booking).toMatchObject({ status: 'cancelled', refundStatus: 'succeeded' });
  });

  it.each([
    ['an amount mismatch', {}, { amountTotal: 1 }],
    ['a currency mismatch', {}, { currency: 'EUR' }],
    ['an expired hold', { status: 'expired' as const }, {}],
    ['a failed hold', { status: 'failed' as const }, {}],
  ])('orphans a paid session with %s for the operator, keeping any stored session id', async (_case, fields, sessionFields) => {
    const { service, em, booking, logger } = held({ ...fields, checkoutSessionId: 'cs_kept' });

    await expect(service.applyCompleted(em as unknown as Cradle['em'], session(booking, sessionFields))).resolves.toMatchObject({
      outcome: 'orphaned',
    });
    expect(booking).toMatchObject({ status: 'payment_orphaned', checkoutSessionId: 'cs_kept' });
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, checkout: { id: `cs_${booking.id}` } }, expect.any(String));
  });

  it('orphans a late payment whose time another active booking now overlaps (never two sessions at once)', async () => {
    const { service, em, booking, slot } = held({ holdExpiresAt: hoursFromNow(-0.5) });
    const profile = booking.mentorProfile.getEntity();
    const next = makeSlot(profile, new Date(slot.startsAt.getTime() + 10 * 60_000));
    (em.find as unknown as { mockResolvedValueOnce: (rows: Booking[]) => void }).mockResolvedValueOnce([
      makeBooking(next, { status: 'confirmed' }),
    ]);

    await expect(service.applyCompleted(em as unknown as Cradle['em'], session(booking))).resolves.toMatchObject({ outcome: 'orphaned' });
    expect(booking.status).toBe('payment_orphaned');
  });

  it('orphans a payment for a slot that was removed or is gone', async () => {
    const removed = held();
    removed.slot.removedAt = NOW;
    await expect(removed.service.applyCompleted(removed.em as unknown as Cradle['em'], session(removed.booking))).resolves.toMatchObject({
      outcome: 'orphaned',
    });

    const gone = held();
    gone.em.findOne
      .mockImplementationOnce(async () => gone.booking)
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => gone.booking)
      .mockImplementationOnce(async () => null);
    await expect(gone.service.applyCompleted(gone.em as unknown as Cradle['em'], session(gone.booking))).resolves.toMatchObject({
      outcome: 'orphaned',
    });
  });

  it.each([
    ['no client reference', { clientReferenceId: null }],
    ['an unknown booking', { clientReferenceId: randomUUID() }],
    ['an unpaid session', { paymentStatus: 'unpaid' as const }],
  ])('ignores a completed session with %s', async (_case, sessionFields) => {
    const { service, em, booking, logger } = held();

    await expect(service.applyCompleted(em as unknown as Cradle['em'], session(booking, sessionFields))).resolves.toMatchObject({
      outcome: 'ignored',
    });
    expect(booking.status).toBe('pending_payment');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('expires a held booking and leaves every other status alone', async () => {
    const pending = held();
    await pending.service.applyExpired(pending.em as unknown as Cradle['em'], session(pending.booking, { status: 'expired' }));
    expect(pending.booking.status).toBe('expired');

    const confirmed = held({ status: 'confirmed' });
    await confirmed.service.applyExpired(confirmed.em as unknown as Cradle['em'], session(confirmed.booking, { status: 'expired' }));
    expect(confirmed.booking.status).toBe('confirmed');

    const unknown = held();
    await unknown.service.applyExpired(unknown.em as unknown as Cradle['em'], session(unknown.booking, { clientReferenceId: randomUUID() }));
    await unknown.service.applyExpired(unknown.em as unknown as Cradle['em'], session(unknown.booking, { clientReferenceId: null }));
    expect(unknown.booking.status).toBe('pending_payment');
  });
});

describe('BookingService.getOwn', () => {
  it('returns the mentee\'s own booking', async () => {
    const { profile, slot } = bookableMentor();
    const booking = makeBooking(slot);
    const { service, em } = setup({ profiles: [profile], slots: [slot], bookings: [booking] });

    await expect(service.getOwn(MENTEE.id, booking.id)).resolves.toEqual({
      id: booking.id,
      status: 'pending_payment',
      lengthMinutes: 25,
      priceCents: 15000,
      currency: 'PLN',
      startsAt: slot.startsAt.toISOString(),
      mentor: { displayName: 'Ada', slug: 'ada' },
      cancellation: null,
      cancelledAt: null,
      refundStatus: null,
      reportedAt: null,
    });
    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id, mentee: MENTEE.id }, { populate: ['mentorProfile'] });
    expect(em.findOne).toHaveBeenCalledWith(BookingReport, { booking: booking.id });
  });

  it('says when the mentee reported it', async () => {
    const { profile, slot } = bookableMentor();
    const booking = makeBooking(slot, { status: 'confirmed' });
    const { service, em } = setup({ profiles: [profile], slots: [slot], bookings: [booking] });
    const read = em.findOne.getMockImplementation();
    em.findOne.mockImplementation(async (entity, where, options) =>
      entity === BookingReport ? Object.assign(new BookingReport(), { createdAt: hoursFromNow(-2) }) : (read?.(entity, where, options) ?? null),
    );

    await expect(service.getOwn(MENTEE.id, booking.id)).resolves.toMatchObject({ reportedAt: hoursFromNow(-2).toISOString() });
  });

  it('offers cancellation terms for a confirmed booking that has not started (R10)', async () => {
    const { profile, slot } = bookableMentor(hoursFromNow(30));
    const free = makeBooking(slot, { status: 'confirmed' });
    const late = makeBooking(makeSlot(profile, hoursFromNow(10)), { status: 'confirmed' });
    const started = makeBooking(makeSlot(profile, hoursFromNow(-0.1)), { status: 'confirmed' });
    const { service } = setup({ profiles: [profile], slots: [slot], bookings: [free, late, started] });

    await expect(service.getOwn(MENTEE.id, free.id)).resolves.toMatchObject({
      cancellation: { refundDue: true, freeUntil: hoursFromNow(6).toISOString() },
    });
    await expect(service.getOwn(MENTEE.id, late.id)).resolves.toMatchObject({
      cancellation: { refundDue: false, freeUntil: hoursFromNow(-14).toISOString() },
    });
    await expect(service.getOwn(MENTEE.id, started.id)).resolves.toMatchObject({ cancellation: null });
  });

  it('shows when a booking was cancelled and its refund', async () => {
    const { profile, slot } = bookableMentor();
    const booking = makeBooking(slot, { status: 'cancelled', cancelledAt: hoursFromNow(-1), refundStatus: 'pending' });
    const { service } = setup({ profiles: [profile], slots: [slot], bookings: [booking] });

    await expect(service.getOwn(MENTEE.id, booking.id)).resolves.toMatchObject({
      cancellation: null,
      cancelledAt: hoursFromNow(-1).toISOString(),
      refundStatus: 'pending',
    });
  });

  it('shows a blank name and no link for a profile without them', async () => {
    const profile = makeMentor({ displayName: null, slug: null });
    const slot = makeSlot(profile, hoursFromNow(24));
    const booking = makeBooking(slot);
    const { service } = setup({ profiles: [profile], slots: [slot], bookings: [booking] });

    await expect(service.getOwn(MENTEE.id, booking.id)).resolves.toMatchObject({ mentor: { displayName: '', slug: null } });
  });

  it('answers 404 for another mentee\'s booking or an unknown id', async () => {
    const { profile, slot } = bookableMentor();
    const booking = makeBooking(slot);
    const { service } = setup({ profiles: [profile], slots: [slot], bookings: [booking] });

    expect(await rejection(service.getOwn(randomUUID(), booking.id))).toMatchObject({ status: 404, message: BOOKING_NOT_FOUND_MESSAGE });
    expect(await rejection(service.getOwn(MENTEE.id, randomUUID()))).toMatchObject({ status: 404 });
  });
});

describe('BookingService.announceConfirmed', () => {
  function confirmed(status: Booking['status'] = 'confirmed', appUrl: string | null = 'https://app.devmentor.test') {
    const { profile, slot } = bookableMentor(new Date('2026-06-23T09:00:00.000Z'));
    (profile.user as unknown as User).email = 'ada@devmentor.test';
    const mentee = ref(Object.assign(new User(), { id: MENTEE.id, email: MENTEE.email }));
    const booking = makeBooking(slot, { status, confirmedAt: NOW, leadMinutes: 1020, mentee: mentee as unknown as Booking['mentee'] });
    const ctx = setup({ profiles: [profile], slots: [slot], bookings: [booking], appUrl });

    return { ...ctx, booking, profile };
  }

  it('emits bookings.booking.confirmed and mails the mentee and the mentor', async () => {
    const { service, em, events, mailSender, booking, profile } = confirmed();

    await service.announceConfirmed(booking.id);

    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id }, { populate: ['mentorProfile.user', 'mentee'] });
    expect(events.emit).toHaveBeenCalledWith('bookings.booking.confirmed', {
      bookingId: booking.id,
      mentorProfileId: profile.id,
      menteeId: MENTEE.id,
      startsAt: booking.startsAt,
      leadMinutes: 1020,
    });
    expect(mailSender.send.mock.calls.map(([message]) => message.to)).toEqual([MENTEE.email, 'ada@devmentor.test']);
  });

  it('sends relative links when APP_URL is missing', async () => {
    const { service, mailSender, booking } = confirmed('confirmed', null);

    await service.announceConfirmed(booking.id);

    expect(mailSender.send.mock.calls[1]?.[0]).toMatchObject({ text: expect.stringContaining('\n\n/mentor/slots') });
  });

  it('keeps going when one email fails, and logs it', async () => {
    const { service, mailSender, logger, booking } = confirmed();
    mailSender.send.mockRejectedValueOnce(new Error('smtp down'));

    await service.announceConfirmed(booking.id);

    expect(mailSender.send).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, err: expect.any(Error) }, 'Booking confirmation email failed');
  });

  it('does nothing for a booking that is unknown or not confirmed', async () => {
    const { service, events, mailSender, booking } = confirmed('payment_orphaned');

    await service.announceConfirmed(booking.id);
    await service.announceConfirmed(randomUUID());

    expect(events.emit).not.toHaveBeenCalled();
    expect(mailSender.send).not.toHaveBeenCalled();
  });
});

describe('confirmationMails', () => {
  it('tells the mentee and the mentor the time in UTC, the length and the price — never a response time', () => {
    const profile = makeMentor();
    (profile.user as unknown as User).email = 'ada@devmentor.test';
    const slot = makeSlot(profile, new Date('2026-06-23T09:00:00.000Z'));
    const mentee = ref(Object.assign(new User(), { id: MENTEE.id, email: MENTEE.email }));
    const booking = makeBooking(slot, { mentee: mentee as unknown as Booking['mentee'] });

    const [toMentee, toMentor] = confirmationMails(booking, 'https://app.test');

    expect(toMentee).toEqual({
      to: MENTEE.email,
      subject: 'Booked: 25-minute session with Ada',
      text: `Your 25-minute text session with Ada is booked for 2026-06-23 09:00 UTC. Open DevMentor to see it in your time zone.\n\nYou paid PLN\u00a0150.00.\n\nhttps://app.test/bookings/${booking.id}`,
    });
    expect(toMentor).toEqual({
      to: 'ada@devmentor.test',
      subject: 'New booking: 25-minute session on 2026-06-23 09:00 UTC',
      text: 'A mentee booked a 25-minute text session with you for 2026-06-23 09:00 UTC. Open DevMentor to see it in your time zone.\n\nhttps://app.test/mentor/slots',
    });
    expect(JSON.stringify([toMentee, toMentor])).not.toMatch(/respond|reply within|guarantee|hours? to/i);
  });

  it('names "your mentor" when the profile has no display name', () => {
    const profile = makeMentor({ displayName: null });
    const slot = makeSlot(profile, hoursFromNow(24));
    const mentee = ref(Object.assign(new User(), { id: MENTEE.id, email: MENTEE.email }));

    expect(confirmationMails(makeBooking(slot, { mentee: mentee as unknown as Booking['mentee'] }), '')[0]?.subject).toBe(
      'Booked: 25-minute session with your mentor',
    );
  });
});

describe('BookingService.releaseOwnHold', () => {
  function own(fields: Partial<Booking> = {}) {
    const { profile, slot } = bookableMentor();
    const booking = makeBooking(slot, { checkoutSessionId: 'cs_own', ...fields });
    const ctx = setup({ profiles: [profile], slots: [slot], bookings: [booking] });

    return { ...ctx, booking };
  }

  it('expires the mentee\'s own held session at Stripe and releases the time', async () => {
    const { service, gateway, booking, em } = own();
    const expire = vi
      .spyOn(gateway, 'expireSession')
      .mockResolvedValueOnce({ kind: 'ok', data: session(booking, { status: 'expired', paymentStatus: 'unpaid' }) });

    await expect(service.releaseOwnHold(MENTEE.id, booking.id)).resolves.toMatchObject({ id: booking.id, status: 'expired' });
    expect(expire).toHaveBeenCalledWith('cs_own');
    expect(em.clear).toHaveBeenCalledOnce();
  });

  it('confirms and announces instead when the session was paid meanwhile', async () => {
    const { service, gateway, booking, events } = own();
    vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce({ kind: 'ok', data: session(booking) });
    (booking as unknown as { mentee: unknown }).mentee = ref(Object.assign(new User(), { id: MENTEE.id, email: MENTEE.email }));
    (booking.mentorProfile.getEntity().user as unknown as User).email = 'ada@devmentor.test';

    await expect(service.releaseOwnHold(MENTEE.id, booking.id)).resolves.toMatchObject({ status: 'confirmed' });
    expect(events.emit).toHaveBeenCalledWith('bookings.booking.confirmed', expect.objectContaining({ bookingId: booking.id }));
  });

  it('announces nothing when a paid session no longer matches the hold', async () => {
    const { service, gateway, booking, events } = own();
    vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce({ kind: 'ok', data: session(booking, { amountTotal: 1 }) });

    await expect(service.releaseOwnHold(MENTEE.id, booking.id)).resolves.toMatchObject({ status: 'payment_orphaned' });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it.each([
    ['Stripe cannot answer', { kind: 'retryable' } as const],
    ['the session is still open', 'open' as const],
  ])('keeps the hold when %s', async (_case, answer) => {
    const { service, gateway, booking } = own();
    vi.spyOn(gateway, 'expireSession').mockResolvedValueOnce(
      answer === 'open' ? { kind: 'ok', data: session(booking, { status: 'open', paymentStatus: 'unpaid' }) } : answer,
    );

    await expect(service.releaseOwnHold(MENTEE.id, booking.id)).resolves.toMatchObject({ status: 'pending_payment' });
  });

  it.each([
    ['confirmed', { status: 'confirmed' as const }],
    ['without a session', { checkoutSessionId: null }],
  ])('leaves a booking that is %s alone, without calling Stripe', async (_case, fields) => {
    const { service, gateway, booking, em } = own(fields);
    const expire = vi.spyOn(gateway, 'expireSession');

    await service.releaseOwnHold(MENTEE.id, booking.id);

    expect(expire).not.toHaveBeenCalled();
    expect(em.clear).not.toHaveBeenCalled();
  });

  it('answers 404 for another mentee\'s booking', async () => {
    const { service, booking } = own();

    expect(await rejection(service.releaseOwnHold(randomUUID(), booking.id))).toMatchObject({ status: 404 });
  });
});
