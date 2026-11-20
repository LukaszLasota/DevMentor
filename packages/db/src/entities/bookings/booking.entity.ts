import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';
import { SlotSchema } from '../availability/slot.entity';
import { MentorProfileSchema } from '../mentors/mentor-profile.entity';

/**
 * Lifecycle (spec 2026-11-20-booking-stripe-checkout): `pending_payment` holds the time while the
 * mentee pays; Stripe's webhook moves it to `confirmed` or `expired`; `failed` = Checkout could not
 * start; `payment_orphaned` = paid but the time was no longer held (operator by hand, R16). Values
 * only grow (#30 adds `cancelled`); rows are financial records and are never deleted.
 */
export const BOOKING_STATUSES = ['pending_payment', 'confirmed', 'expired', 'failed', 'payment_orphaned'] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy their slot (a `pending_payment` hold only until `hold_expires_at`). */
export const ACTIVE_BOOKING_STATUSES = ['pending_payment', 'confirmed'] as const satisfies readonly BookingStatus[];

/** Named so `BookingService` maps a lost race for one slot (and only that) to 409. */
export const ACTIVE_BOOKING_SLOT_UNIQUE = 'bookings_slot_active_uq';

export const BOOKING_LENGTHS = [25, 50] as const;

export const BOOKING_STATUS_CHECK = `status in (${BOOKING_STATUSES.map((status) => `'${status}'`).join(', ')})`;
export const BOOKING_LENGTH_CHECK = `length_minutes in (${BOOKING_LENGTHS.join(', ')})`;
export const BOOKING_PRICE_CHECK = 'price_cents > 0';
export const BOOKING_CURRENCY_CHECK = "currency ~ '^[A-Z]{3}$'";
export const BOOKING_ENDS_CHECK = 'ends_at = starts_at + make_interval(mins => length_minutes)';
export const BOOKING_CONFIRMED_CHECK = "status <> 'confirmed' or (confirmed_at is not null and lead_minutes is not null)";

const now = () => new Date();

/**
 * One mentee's booking of one slot. `slot`, `startsAt`, `endsAt`, length and price are a snapshot
 * taken when the hold is created and never change (the slot's mentor may later remove or move on).
 * `mentorProfile` is denormalized for the per-mentor lock and overlap query.
 */
export const BookingSchema = defineEntity({
  name: 'Booking',
  tableName: 'bookings',
  checks: [
    { name: 'bookings_status_check', expression: BOOKING_STATUS_CHECK },
    { name: 'bookings_length_check', expression: BOOKING_LENGTH_CHECK },
    { name: 'bookings_price_check', expression: BOOKING_PRICE_CHECK },
    { name: 'bookings_currency_check', expression: BOOKING_CURRENCY_CHECK },
    { name: 'bookings_ends_check', expression: BOOKING_ENDS_CHECK },
    { name: 'bookings_confirmed_check', expression: BOOKING_CONFIRMED_CHECK },
  ],
  uniques: [
    {
      name: ACTIVE_BOOKING_SLOT_UNIQUE,
      properties: ['slot'],
      where: `status in (${ACTIVE_BOOKING_STATUSES.map((status) => `'${status}'`).join(', ')})`,
    },
  ],
  indexes: [{ name: 'bookings_mentor_profile_status_idx', properties: ['mentorProfile', 'status'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    slot: () => p.manyToOne(SlotSchema).ref().deleteRule('restrict'),
    mentorProfile: () => p.manyToOne(MentorProfileSchema).ref().deleteRule('restrict'),
    mentee: () => p.manyToOne(UserSchema).ref().deleteRule('restrict'),
    startsAt: p.datetime(),
    endsAt: p.datetime(),
    lengthMinutes: p.smallint(),
    priceCents: p.integer(),
    currency: p.string().length(3),
    status: p.string().$type<BookingStatus>().columnType('text'),
    holdExpiresAt: p.datetime(),
    checkoutSessionId: p.text().nullable().unique(),
    confirmedAt: p.datetime().nullable(),
    /** R09: minutes from confirmation to the start, recorded once. */
    leadMinutes: p.integer().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class Booking extends BookingSchema.class {}

BookingSchema.setClass(Booking);
