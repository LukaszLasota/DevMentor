import { ACTIVE_SLOT_UNIQUE, Booking, isUniqueViolation, LockMode, MentorProfile, Slot } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import type { SessionLength } from '../../domain/session-lengths';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors';
import type { SlotCreateInput } from '../../validators/availability/slot-create.schema';
import { freeLengths, type BusyInterval } from '../bookings/occupancy';
import { horizonFrom, MAX_ACTIVE_FUTURE_SLOTS, meetsLeadTime, PAST_LIST_LIMIT } from './lead-time';

export const MENTOR_PROFILE_MISSING_MESSAGE = 'Mentor profile not found.';
export const SLOT_NOT_FOUND_MESSAGE = 'Slot not found.';
export const SLOT_IN_PAST_MESSAGE = 'Pick a start time in the future.';
export const SLOT_BEYOND_HORIZON_MESSAGE = 'Pick a start time within the next 365 days.';
export const SLOT_DUPLICATE_MESSAGE = 'You already have a slot at this time.';
export const SLOT_CAP_MESSAGE = `You have ${MAX_ACTIVE_FUTURE_SLOTS} upcoming slots, the most allowed. Remove one first.`;
export const SLOT_BOOKED_MESSAGE = 'This time is booked or held for payment and cannot be removed.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A slot as its owner and the public page see it: no `removedAt`, nothing private. */
export interface SlotView {
  id: string;
  startsAt: string;
  /** Evaluated at read time with the server clock (R09), never stored. */
  meetsLeadTime: boolean;
  /**
   * Lengths a mentee can book now (spec #29, Q9): free of every active booking of the mentor, and
   * empty when the slot is less than two hours away.
   */
  bookableLengths: SessionLength[];
}

/** The owner's view adds whether the slot itself is held for payment or booked (spec #29). */
export interface OwnerSlotView extends SlotView {
  booking: 'held' | 'booked' | null;
}

/** An active booking as occupancy reads it. */
interface ActiveBooking extends BusyInterval {
  slotId: string;
  mentorProfileId: string;
  status: 'held' | 'booked';
}

export type SlotScope = 'upcoming' | 'past';

/** Bookable slots of one mentor at `now`: how many, and the earliest start (spec #27). */
export interface BookableSummary {
  count: number;
  nextStartsAt: Date;
}

/** `busy` = the active bookings of the slot's mentor; omitted for a slot that was just created. */
export function toSlotView(slot: Slot, now: Date, busy: readonly BusyInterval[] = []): SlotView {
  const lead = meetsLeadTime(slot.startsAt, now);

  return {
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    meetsLeadTime: lead,
    bookableLengths: lead ? freeLengths(slot.startsAt, busy) : [],
  };
}

/**
 * Bookings that occupy time at `now`: confirmed ones, and holds whose payment window has not passed
 * (spec #29: reads never write — an expired hold is free here, its row is released by the next booking).
 */
export function activeBookingsWhere(mentorProfileIds: readonly string[], now: Date) {
  return {
    mentorProfile: { $in: [...mentorProfileIds] },
    endsAt: { $gt: now },
    $or: [{ status: 'confirmed' as const }, { status: 'pending_payment' as const, holdExpiresAt: { $gt: now } }],
  };
}

/** `SELECT … FOR UPDATE` that re-reads the row (lesson 2026-10-26); built at call time. */
function lockForUpdate() {
  return { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as const;
}

/**
 * A mentor's availability (spec 2026-10-21-availability-slots): single start instants, soft-removed.
 * Every owner method resolves the caller's own `MentorProfile` (404 without one, never created) and
 * scopes every query by it. Publishing holds the profile row `FOR UPDATE`, so the 200-slot cap holds
 * under concurrent publishes; the partial unique index decides duplicates.
 */
export class SlotService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly events: Cradle['events'];

  constructor({ em, clock, events }: Pick<Cradle, 'em' | 'clock' | 'events'>) {
    this.em = em;
    this.clock = clock;
    this.events = events;
  }

  /**
   * `upcoming`: future, ascending (at most the cap); `past`: started, descending, the last 50. Each
   * slot says whether it is held for payment or booked (`/mentor/slots`, spec #29).
   */
  async listMine(userId: string, scope: SlotScope): Promise<OwnerSlotView[]> {
    const profile = await this.ownProfile(this.em, userId);
    const now = this.clock.now();
    const upcoming = scope === 'upcoming';
    const slots = await this.em.find(
      Slot,
      { mentorProfile: profile.id, removedAt: null, startsAt: upcoming ? { $gt: now } : { $lte: now } },
      { orderBy: { startsAt: upcoming ? 'asc' : 'desc' }, limit: upcoming ? MAX_ACTIVE_FUTURE_SLOTS : PAST_LIST_LIMIT },
    );
    const bookings = await this.activeBookings(this.em, [profile.id], now);

    return slots.map((slot) => ({
      ...toSlotView(slot, now, bookings),
      booking: bookings.find((booking) => booking.slotId === slot.id)?.status ?? null,
    }));
  }

  /**
   * Publishes one start instant: refused when not in the future or beyond 365 days (400 on
   * `startsAt`), at 200 active future slots or as a duplicate active start (409). Moves
   * `last_published_availability_at` to now, never backwards. `availability.slot.published` after commit.
   */
  async publish(userId: string, input: SlotCreateInput): Promise<SlotView> {
    const startsAt = new Date(input.startsAt);
    const now = this.clock.now();
    let created: { slot: Slot; mentorProfileId: string };

    try {
      // Its own fork: a failed flush poisons that unit of work only, and nothing reuses it after.
      created = await this.em.transactional(async (em) => {
        const profile = await this.ownProfile(em, userId, true);

        if (startsAt <= now) {
          throw new ValidationError(SLOT_IN_PAST_MESSAGE, { startsAt: [SLOT_IN_PAST_MESSAGE] });
        }

        if (startsAt > horizonFrom(now)) {
          throw new ValidationError(SLOT_BEYOND_HORIZON_MESSAGE, { startsAt: [SLOT_BEYOND_HORIZON_MESSAGE] });
        }

        const active = await em.count(Slot, { mentorProfile: profile.id, removedAt: null, startsAt: { $gt: now } });

        if (active >= MAX_ACTIVE_FUTURE_SLOTS) {
          throw new ConflictError(SLOT_CAP_MESSAGE);
        }

        const slot = em.create(Slot, { mentorProfile: profile, startsAt });
        // GREATEST(COALESCE(last, now), now), computed on the row this transaction holds locked.
        const last = profile.lastPublishedAvailabilityAt;
        profile.lastPublishedAvailabilityAt = last != null && last > now ? last : now;

        return { slot, mentorProfileId: profile.id };
      });
    } catch (error) {
      if (isUniqueViolation(error, ACTIVE_SLOT_UNIQUE)) {
        throw new ConflictError(SLOT_DUPLICATE_MESSAGE);
      }

      throw error;
    }

    const { slot, mentorProfileId } = created;
    await this.events.emit('availability.slot.published', { mentorProfileId, slotId: slot.id, startsAt: slot.startsAt });

    return toSlotView(slot, now);
  }

  /**
   * Soft-removes the caller's own active slot; unknown, already removed or another mentor's → 404
   * (no existence leak); held for payment or booked → 409 (spec #29). Runs under the profile row lock
   * that booking takes too, so a removal and a booking of the same time cannot both win.
   * `last_published_availability_at` is not touched.
   */
  async remove(userId: string, slotId: string): Promise<{ id: string }> {
    return this.em.transactional(async (em) => {
      const profile = await this.ownProfile(em, userId, true);
      const slot = UUID.test(slotId) ? await em.findOne(Slot, { id: slotId, mentorProfile: profile.id, removedAt: null }) : null;

      if (slot === null) {
        throw new NotFoundError(SLOT_NOT_FOUND_MESSAGE);
      }

      const now = this.clock.now();
      const bookings = await this.activeBookings(em, [profile.id], now);

      if (bookings.some((booking) => booking.slotId === slot.id)) {
        throw new ConflictError(SLOT_BOOKED_MESSAGE);
      }

      slot.removedAt = now;

      return { id: slot.id };
    });
  }

  /**
   * Bookable slots — future, non-removed, meeting the lead time at `now` (inclusive at two hours) and
   * with at least one free length (spec #29) — per mentor, for many mentors in one slot query and one
   * booking query (spec #27); mentors with none are absent from the map; no ids, no query. Grouped
   * here: core cannot use MikroORM's raw SQL helpers, and 1.0 holds at most 50 mentors × 200 slots.
   */
  async bookableSummaryFor(mentorProfileIds: readonly string[], now: Date): Promise<Map<string, BookableSummary>> {
    const summary = new Map<string, BookableSummary>();

    if (mentorProfileIds.length === 0) {
      return summary;
    }

    const slots = await this.em.find(
      Slot,
      { mentorProfile: { $in: [...mentorProfileIds] }, removedAt: null, startsAt: { $gt: now } },
      { orderBy: { startsAt: 'asc' } },
    );
    const bookings = await this.activeBookings(this.em, mentorProfileIds, now);

    for (const slot of slots) {
      const mentorProfileId = slot.mentorProfile.id;
      const busy = bookings.filter((booking) => booking.mentorProfileId === mentorProfileId);

      if (toSlotView(slot, now, busy).bookableLengths.length === 0) {
        continue;
      }

      const entry = summary.get(mentorProfileId);

      if (entry === undefined) {
        summary.set(mentorProfileId, { count: 1, nextStartsAt: slot.startsAt });
      } else {
        entry.count += 1;
      }
    }

    return summary;
  }

  /** The `hasBookableSlot` and D13 count for one mentor, with the same rule as `bookableSummaryFor`. */
  async countBookable(mentorProfileId: string, now: Date): Promise<number> {
    return (await this.bookableSummaryFor([mentorProfileId], now)).get(mentorProfileId)?.count ?? 0;
  }

  /**
   * Future, non-removed slots for a public page, ascending, each with its lead-time state and free
   * lengths at `now`. A slot with no free length (booked, held, or inside another booking) is left out.
   */
  async listPublicFor(mentorProfileId: string, now: Date): Promise<SlotView[]> {
    const slots = await this.em.find(
      Slot,
      { mentorProfile: mentorProfileId, removedAt: null, startsAt: { $gt: now } },
      { orderBy: { startsAt: 'asc' }, limit: MAX_ACTIVE_FUTURE_SLOTS },
    );
    const bookings = await this.activeBookings(this.em, [mentorProfileId], now);

    return slots
      .filter((slot) => freeLengths(slot.startsAt, bookings).length > 0)
      .map((slot) => toSlotView(slot, now, bookings));
  }

  /** Active bookings of these mentors at `now` (see `activeBookingsWhere`). */
  private async activeBookings(em: Cradle['em'], mentorProfileIds: readonly string[], now: Date): Promise<ActiveBooking[]> {
    const rows = await em.find(Booking, activeBookingsWhere(mentorProfileIds, now));

    return rows.map((row) => ({
      slotId: row.slot.id,
      mentorProfileId: row.mentorProfile.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status === 'confirmed' ? 'booked' : 'held',
    }));
  }

  private async ownProfile(em: Cradle['em'], userId: string, lock = false): Promise<MentorProfile> {
    const profile = await em.findOne(MentorProfile, { user: userId }, lock ? lockForUpdate() : {});

    if (profile === null) {
      throw new NotFoundError(MENTOR_PROFILE_MISSING_MESSAGE);
    }

    return profile;
  }
}
