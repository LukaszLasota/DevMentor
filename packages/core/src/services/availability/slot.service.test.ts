import { randomUUID } from 'node:crypto';
import { ACTIVE_SLOT_UNIQUE, Booking, LockMode, MentorProfile, Slot, UniqueConstraintViolationException } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { MAX_ACTIVE_FUTURE_SLOTS, PAST_LIST_LIMIT } from './lead-time';
import {
  MENTOR_PROFILE_MISSING_MESSAGE,
  SLOT_BEYOND_HORIZON_MESSAGE,
  SLOT_BOOKED_MESSAGE,
  SLOT_CAP_MESSAGE,
  SLOT_DUPLICATE_MESSAGE,
  SLOT_IN_PAST_MESSAGE,
  SLOT_NOT_FOUND_MESSAGE,
  SlotService,
} from './slot.service';

const NOW = new Date('2026-06-22T16:00:00.000Z');
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const at = (iso: string) => new Date(iso);
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

type Where = Record<string, unknown>;
type Range = { $gt?: Date; $gte?: Date; $lte?: Date; $in?: string[] };

/** Equality, `{ $gt | $gte | $lte }` on dates, and a string compared with a reference's `id`. */
function matches(row: object, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = (row as Where)[key];

    if (key === '$or') {
      return (expected as Where[]).some((branch) => matches(row, branch));
    }

    if (expected !== null && typeof expected === 'object' && '$in' in expected) {
      return ((expected as Range).$in as string[]).includes((actual as { id: string }).id);
    }

    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const range = expected as Range;
      const time = (actual as Date).getTime();

      return (
        (range.$gt === undefined || time > range.$gt.getTime()) &&
        (range.$gte === undefined || time >= range.$gte.getTime()) &&
        (range.$lte === undefined || time <= range.$lte.getTime())
      );
    }

    if (typeof expected === 'string' && actual !== null && typeof actual === 'object' && 'id' in actual) {
      return (actual as { id: string }).id === expected;
    }

    return (actual ?? null) === expected;
  });
}

function makeProfile(userId = randomUUID(), fields: Partial<MentorProfile> = {}): MentorProfile {
  return Object.assign(new MentorProfile(), {
    id: randomUUID(),
    user: { id: userId },
    lastPublishedAvailabilityAt: null,
    ...fields,
  });
}

function makeSlot(profile: MentorProfile, startsAt: Date, removedAt: Date | null = null): Slot {
  return Object.assign(new Slot(), { id: randomUUID(), mentorProfile: profile, startsAt, removedAt });
}

/** A booking of `slot` for `minutes`; a hold expires 30 minutes from NOW unless `holdExpiresAt` is given. */
function makeBooking(
  slot: Slot,
  minutes: 25 | 50,
  status: Booking['status'] = 'confirmed',
  holdExpiresAt: Date = hoursFromNow(0.5),
): Booking {
  return Object.assign(new Booking(), {
    id: randomUUID(),
    slot,
    mentorProfile: slot.mentorProfile,
    startsAt: slot.startsAt,
    endsAt: new Date(slot.startsAt.getTime() + minutes * 60_000),
    lengthMinutes: minutes,
    status,
    holdExpiresAt,
  });
}

/**
 * In-memory stand-in for the scoped `EntityManager`. `transactional` commits created slots and
 * enforces the partial unique index on active starts (mentor + instant, `removed_at is null`) at
 * commit, throwing the driver's named violation like PostgreSQL would.
 */
function fakeEm(profiles: MentorProfile[], slots: Slot[], bookings: Booking[] = []) {
  let pending: Slot[] = [];
  const table = (entity: unknown): object[] => (entity === Slot ? slots : entity === Booking ? bookings : profiles);
  const em = {
    findOne: vi.fn<(entity: unknown, where: Where, options?: object) => Promise<object | null>>(async (entity, where) =>
      table(entity).find((row) => matches(row, where)) ?? null,
    ),
    find: vi.fn(async (entity: unknown, where: Where, options?: { orderBy: { startsAt: 'asc' | 'desc' }; limit?: number }) =>
      (table(entity) as Slot[])
        .filter((row) => matches(row, where))
        .sort((a, b) => (a.startsAt.getTime() - b.startsAt.getTime()) * (options?.orderBy.startsAt === 'desc' ? -1 : 1))
        .slice(0, options?.limit),
    ),
    count: vi.fn(async (entity: unknown, where: Where) => table(entity).filter((row) => matches(row, where)).length),
    create: vi.fn((_entity: unknown, data: Partial<Slot>) => {
      const slot = Object.assign(new Slot(), { id: randomUUID(), removedAt: null, ...data });
      pending.push(slot);
      return slot;
    }),
    flush: vi.fn(async () => undefined),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      pending = [];
      const result = await callback(em);
      for (const slot of pending) {
        const clash = slots.some(
          (row) => row.removedAt == null && row.mentorProfile.id === slot.mentorProfile.id && row.startsAt.getTime() === slot.startsAt.getTime(),
        );
        if (clash) {
          throw new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint: ACTIVE_SLOT_UNIQUE }));
        }
      }
      slots.push(...pending);
      return result;
    }),
  };

  return em;
}

function setup(profiles: MentorProfile[] = [], slots: Slot[] = [], bookings: Booking[] = []) {
  const em = fakeEm(profiles, slots, bookings);
  const events = { emit: vi.fn(async () => undefined) };
  const service = new SlotService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    events: events as unknown as Cradle['events'],
  });

  return { em, events, service, slots };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('SlotService.publish', () => {
  it('stores the instant under the profile row lock, moves the ordering key to now and emits after commit', async () => {
    const profile = makeProfile();
    const { em, events, service, slots } = setup([profile]);

    const view = await service.publish(profile.user.id, { startsAt: '2026-06-23T09:00:00.000Z' });

    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: profile.user.id }, LOCK);
    expect(view).toEqual({ id: slots[0]?.id, startsAt: '2026-06-23T09:00:00.000Z', meetsLeadTime: true, bookableLengths: ['25', '50'] });
    expect(profile.lastPublishedAvailabilityAt).toEqual(NOW);
    expect(events.emit).toHaveBeenCalledExactlyOnceWith('availability.slot.published', {
      mentorProfileId: profile.id,
      slotId: slots[0]?.id,
      startsAt: at('2026-06-23T09:00:00.000Z'),
    });
  });

  it('accepts a future slot within two hours, shown as not meeting the lead time', async () => {
    const profile = makeProfile();
    const { service } = setup([profile]);

    expect(await service.publish(profile.user.id, { startsAt: hoursFromNow(1).toISOString() })).toMatchObject({ meetsLeadTime: false });
  });

  it('never moves the ordering key backwards (GREATEST)', async () => {
    const later = hoursFromNow(1);
    const profile = makeProfile(undefined, { lastPublishedAvailabilityAt: later });
    const { service } = setup([profile]);

    await service.publish(profile.user.id, { startsAt: hoursFromNow(48).toISOString() });

    expect(profile.lastPublishedAvailabilityAt).toEqual(later);
  });

  it.each([
    ['in the past', hoursFromNow(-1), SLOT_IN_PAST_MESSAGE],
    ['exactly now', NOW, SLOT_IN_PAST_MESSAGE],
    ['beyond 365 days', hoursFromNow(365 * 24 + 1), SLOT_BEYOND_HORIZON_MESSAGE],
  ])('refuses a start %s with a field error and stores nothing', async (_case, startsAt, message) => {
    const profile = makeProfile();
    const { events, service, slots } = setup([profile]);

    expect(await rejection(service.publish(profile.user.id, { startsAt: startsAt.toISOString() }))).toMatchObject({
      status: 400,
      fieldErrors: { startsAt: [message] },
    });
    expect(slots).toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('accepts exactly 365 days ahead', async () => {
    const profile = makeProfile();
    const { service } = setup([profile]);

    await expect(service.publish(profile.user.id, { startsAt: hoursFromNow(365 * 24).toISOString() })).resolves.toBeDefined();
  });

  it('refuses a duplicate active start with 409 and keeps one slot', async () => {
    const profile = makeProfile();
    const start = hoursFromNow(24);
    const { service, slots } = setup([profile], [makeSlot(profile, start)]);

    expect(await rejection(service.publish(profile.user.id, { startsAt: start.toISOString() }))).toMatchObject({
      status: 409,
      message: SLOT_DUPLICATE_MESSAGE,
    });
    expect(slots).toHaveLength(1);
  });

  it('lets a removed start be republished', async () => {
    const profile = makeProfile();
    const start = hoursFromNow(24);
    const { service, slots } = setup([profile], [makeSlot(profile, start, hoursFromNow(-1))]);

    await service.publish(profile.user.id, { startsAt: start.toISOString() });

    expect(slots.filter((slot) => slot.removedAt == null)).toHaveLength(1);
  });

  it('accepts the 200th active future slot and refuses the 201st with 409', async () => {
    const profile = makeProfile();
    const existing = Array.from({ length: MAX_ACTIVE_FUTURE_SLOTS - 1 }, (_, i) => makeSlot(profile, hoursFromNow(3 + i)));
    const { service, slots } = setup([profile], existing);

    await service.publish(profile.user.id, { startsAt: hoursFromNow(1000).toISOString() });
    expect(await rejection(service.publish(profile.user.id, { startsAt: hoursFromNow(1001).toISOString() }))).toMatchObject({
      status: 409,
      message: SLOT_CAP_MESSAGE,
    });
    expect(slots).toHaveLength(MAX_ACTIVE_FUTURE_SLOTS);
  });

  it('does not count removed or past slots toward the cap', async () => {
    const profile = makeProfile();
    const removed = Array.from({ length: MAX_ACTIVE_FUTURE_SLOTS }, (_, i) => makeSlot(profile, hoursFromNow(3 + i), NOW));
    const past = makeSlot(profile, hoursFromNow(-5));
    const { service } = setup([profile], [...removed, past]);

    await expect(service.publish(profile.user.id, { startsAt: hoursFromNow(10).toISOString() })).resolves.toBeDefined();
  });

  it('maps only the named index to 409; any other failure propagates', async () => {
    const profile = makeProfile();
    const { em, service } = setup([profile]);
    const other = new UniqueConstraintViolationException(Object.assign(new Error('dup'), { constraint: 'slots_pkey' }));
    em.transactional.mockRejectedValueOnce(other);

    expect(await rejection(service.publish(profile.user.id, { startsAt: hoursFromNow(24).toISOString() }))).toBe(other);
  });

  it('answers 404 for a mentor without a profile (no implicit creation)', async () => {
    const { service, slots } = setup();

    expect(await rejection(service.publish(randomUUID(), { startsAt: hoursFromNow(24).toISOString() }))).toMatchObject({
      status: 404,
      message: MENTOR_PROFILE_MISSING_MESSAGE,
    });
    expect(slots).toEqual([]);
  });
});

describe('SlotService.listMine', () => {
  it('lists upcoming slots ascending with their lead-time state, without removed or other mentors\' slots', async () => {
    const mine = makeProfile();
    const other = makeProfile();
    const { service } = setup(
      [mine, other],
      [
        makeSlot(mine, hoursFromNow(24)),
        makeSlot(mine, hoursFromNow(1)),
        makeSlot(mine, hoursFromNow(5), NOW),
        makeSlot(mine, hoursFromNow(-3)),
        makeSlot(other, hoursFromNow(2)),
      ],
    );

    const upcoming = await service.listMine(mine.user.id, 'upcoming');

    expect(upcoming.map(({ startsAt, meetsLeadTime }) => [startsAt, meetsLeadTime])).toEqual([
      [hoursFromNow(1).toISOString(), false],
      [hoursFromNow(24).toISOString(), true],
    ]);
    expect(Object.keys(upcoming[0] as object).sort()).toEqual(['bookableLengths', 'booking', 'id', 'meetsLeadTime', 'startsAt']);
    expect(upcoming.map((slot) => slot.bookableLengths)).toEqual([[], ['25', '50']]);
  });

  it('marks a slot booked or held, ignores an expired hold and other statuses, and narrows lengths next to a booking', async () => {
    const mine = makeProfile();
    const booked = makeSlot(mine, hoursFromNow(24));
    const held = makeSlot(mine, hoursFromNow(30));
    const staleHold = makeSlot(mine, hoursFromNow(40));
    const expired = makeSlot(mine, hoursFromNow(50));
    const nextTo = makeSlot(mine, new Date(hoursFromNow(30).getTime() - 30 * 60_000));
    const { service } = setup(
      [mine],
      [booked, held, staleHold, expired, nextTo],
      [
        makeBooking(booked, 25),
        makeBooking(held, 50, 'pending_payment'),
        makeBooking(staleHold, 25, 'pending_payment', hoursFromNow(-0.1)),
        makeBooking(expired, 25, 'expired'),
      ],
    );

    const list = await service.listMine(mine.user.id, 'upcoming');

    expect(list.map(({ id, booking, bookableLengths }) => [id, booking, bookableLengths])).toEqual([
      [booked.id, 'booked', []],
      [nextTo.id, null, ['25']],
      [held.id, 'held', []],
      [staleHold.id, null, ['25', '50']],
      [expired.id, null, ['25', '50']],
    ]);
  });

  it('marks a slot cancelled by its mentee until it is booked again (AC4)', async () => {
    const mine = makeProfile();
    const cancelled = makeSlot(mine, hoursFromNow(24));
    const rebooked = makeSlot(mine, hoursFromNow(30));
    const { service } = setup(
      [mine],
      [cancelled, rebooked],
      [makeBooking(cancelled, 25, 'cancelled'), makeBooking(rebooked, 25, 'cancelled'), makeBooking(rebooked, 50)],
    );

    const list = await service.listMine(mine.user.id, 'upcoming');

    expect(list.map(({ id, booking, bookableLengths }) => [id, booking, bookableLengths])).toEqual([
      [cancelled.id, 'cancelled', ['25', '50']],
      [rebooked.id, 'booked', []],
    ]);
  });

  it('lists past slots descending, the last 50', async () => {
    const mine = makeProfile();
    const past = Array.from({ length: PAST_LIST_LIMIT + 5 }, (_, i) => makeSlot(mine, hoursFromNow(-1 - i)));
    const { service } = setup([mine], past);

    const list = await service.listMine(mine.user.id, 'past');

    expect(list).toHaveLength(PAST_LIST_LIMIT);
    expect(list[0]?.startsAt).toBe(hoursFromNow(-1).toISOString());
  });

  it('answers 404 for a mentor without a profile', async () => {
    const { service } = setup();

    expect(await rejection(service.listMine(randomUUID(), 'upcoming'))).toMatchObject({ status: 404 });
  });
});

describe('SlotService.remove', () => {
  it('soft-removes the caller\'s own slot and keeps the ordering key', async () => {
    const key = hoursFromNow(-2);
    const mine = makeProfile(undefined, { lastPublishedAvailabilityAt: key });
    const slot = makeSlot(mine, hoursFromNow(24));
    const { em, service } = setup([mine], [slot]);

    expect(await service.remove(mine.user.id, slot.id)).toEqual({ id: slot.id });
    expect(slot.removedAt).toEqual(NOW);
    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: mine.user.id }, LOCK);
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(mine.lastPublishedAvailabilityAt).toEqual(key);
  });

  it.each([
    ['booked', 'confirmed', hoursFromNow(0.5)],
    ['held for payment', 'pending_payment', hoursFromNow(0.5)],
  ] as const)('refuses a slot that is %s with 409 and keeps it', async (_case, status, holdExpiresAt) => {
    const mine = makeProfile();
    const slot = makeSlot(mine, hoursFromNow(24));
    const { service } = setup([mine], [slot], [makeBooking(slot, 25, status, holdExpiresAt)]);

    expect(await rejection(service.remove(mine.user.id, slot.id))).toMatchObject({ status: 409, message: SLOT_BOOKED_MESSAGE });
    expect(slot.removedAt).toBeNull();
  });

  it('removes a slot whose hold has expired', async () => {
    const mine = makeProfile();
    const slot = makeSlot(mine, hoursFromNow(24));
    const { service } = setup([mine], [slot], [makeBooking(slot, 25, 'pending_payment', hoursFromNow(-0.1))]);

    await service.remove(mine.user.id, slot.id);

    expect(slot.removedAt).toEqual(NOW);
  });

  it.each([
    ['another mentor\'s slot', 'other'],
    ['an already removed slot', 'removed'],
    ['an unknown id', 'unknown'],
    ['a malformed id', 'malformed'],
  ])('answers 404 for %s and changes nothing', async (_case, kind) => {
    const mine = makeProfile();
    const other = makeProfile();
    const otherSlot = makeSlot(other, hoursFromNow(24));
    const removed = makeSlot(mine, hoursFromNow(30), hoursFromNow(-1));
    const { em, service } = setup([mine, other], [otherSlot, removed]);
    const id = { other: otherSlot.id, removed: removed.id, unknown: randomUUID(), malformed: 'not-a-uuid' }[kind] as string;

    expect(await rejection(service.remove(mine.user.id, id))).toMatchObject({ status: 404, message: SLOT_NOT_FOUND_MESSAGE });
    expect(otherSlot.removedAt).toBeNull();
    expect(em.find).not.toHaveBeenCalled();
  });

  it('answers 404 for a mentor without a profile', async () => {
    const { service } = setup();

    expect(await rejection(service.remove(randomUUID(), randomUUID()))).toMatchObject({ status: 404 });
  });
});

describe('SlotService.bookableSummaryFor (#27)', () => {
  it('summarises several mentors in one query: count and earliest bookable start; mentors without any are absent', async () => {
    const ada = makeProfile();
    const bob = makeProfile();
    const cy = makeProfile();
    const { em, service } = setup(
      [ada, bob, cy],
      [
        makeSlot(ada, hoursFromNow(48)),
        makeSlot(ada, hoursFromNow(2)),
        makeSlot(ada, hoursFromNow(1.9)),
        makeSlot(bob, hoursFromNow(30)),
        makeSlot(bob, hoursFromNow(10), NOW),
        makeSlot(cy, hoursFromNow(1)),
      ],
    );

    const summary = await service.bookableSummaryFor([ada.id, bob.id, cy.id], NOW);

    expect([...summary.entries()]).toEqual([
      [ada.id, { count: 2, nextStartsAt: hoursFromNow(2) }],
      [bob.id, { count: 1, nextStartsAt: hoursFromNow(30) }],
    ]);
    // One slot query and one booking query, whatever the number of mentors.
    expect(em.find).toHaveBeenCalledTimes(2);
  });

  it('skips booked slots and counts a mentor only by slots with a free length', async () => {
    const ada = makeProfile();
    const bob = makeProfile();
    const adaBooked = makeSlot(ada, hoursFromNow(5));
    const adaFree = makeSlot(ada, hoursFromNow(9));
    const bobBooked = makeSlot(bob, hoursFromNow(5));
    const { service } = setup([ada, bob], [adaBooked, adaFree, bobBooked], [makeBooking(adaBooked, 50), makeBooking(bobBooked, 25)]);

    expect([...(await service.bookableSummaryFor([ada.id, bob.id], NOW)).entries()]).toEqual([
      [ada.id, { count: 1, nextStartsAt: hoursFromNow(9) }],
    ]);
  });

  it('runs no query for no ids', async () => {
    const { em, service } = setup();

    expect((await service.bookableSummaryFor([], NOW)).size).toBe(0);
    expect(em.find).not.toHaveBeenCalled();
  });
});

describe('SlotService public reads', () => {
  it('counts only future, active slots that meet the lead time (inclusive at two hours)', async () => {
    const mine = makeProfile();
    const { service } = setup(
      [mine],
      [
        makeSlot(mine, hoursFromNow(2)),
        makeSlot(mine, hoursFromNow(1.9)),
        makeSlot(mine, hoursFromNow(48), NOW),
        makeSlot(mine, hoursFromNow(-1)),
      ],
    );

    expect(await service.countBookable(mine.id, NOW)).toBe(1);
    expect(await service.countBookable(makeProfile().id, NOW)).toBe(0);
  });

  it('lists a page\'s future active slots ascending with their lead-time state', async () => {
    const mine = makeProfile();
    const { service } = setup(
      [mine],
      [makeSlot(mine, hoursFromNow(24)), makeSlot(mine, hoursFromNow(1)), makeSlot(mine, hoursFromNow(-1)), makeSlot(mine, hoursFromNow(5), NOW)],
    );

    expect((await service.listPublicFor(mine.id, NOW)).map((slot) => [slot.startsAt, slot.meetsLeadTime])).toEqual([
      [hoursFromNow(1).toISOString(), false],
      [hoursFromNow(24).toISOString(), true],
    ]);
  });

  it('leaves out taken slots and offers only the free lengths of the rest', async () => {
    const mine = makeProfile();
    const taken = makeSlot(mine, hoursFromNow(24));
    const inside = makeSlot(mine, new Date(hoursFromNow(24).getTime() + 30 * 60_000));
    const before = makeSlot(mine, new Date(hoursFromNow(24).getTime() - 30 * 60_000));
    const { service } = setup([mine], [taken, inside, before], [makeBooking(taken, 50)]);

    expect((await service.listPublicFor(mine.id, NOW)).map((slot) => [slot.id, slot.bookableLengths])).toEqual([[before.id, ['25']]]);
    expect(await service.countBookable(mine.id, NOW)).toBe(1);
  });
});
