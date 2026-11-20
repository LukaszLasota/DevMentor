import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { BookingSchema } from '../bookings/booking.entity';
import { MentorProfileSchema } from '../mentors/mentor-profile.entity';

/**
 * Payout lifecycle (spec 2026-11-21-mentor-payouts): `held` (a guard said no, with a reason),
 * `transferring` (claimed; the Stripe call may or may not have happened), `transferred`, `failed`
 * (Stripe refused; retried with the next attempt key after a lookup).
 */
export const PAYOUT_STATUSES = ['held', 'transferring', 'transferred', 'failed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const HOLD_REASONS = ['connect_not_enabled', 'disputed', 'charge_reversed'] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

export const PAYOUT_CHECKS = {
  payouts_status_check: `status in (${list(PAYOUT_STATUSES)})`,
  payouts_hold_reason_check: `hold_reason is null or hold_reason in (${list(HOLD_REASONS)})`,
  payouts_held_check: "(status = 'held') = (hold_reason is not null)",
  payouts_transferred_check: "status <> 'transferred' or transfer_id is not null",
  payouts_amounts_check: 'fee_cents + net_cents = gross_cents',
  payouts_gross_check: 'gross_cents > 0',
  payouts_net_check: 'net_cents > 0',
  payouts_fee_check: 'fee_cents >= 0',
  payouts_fee_bps_check: 'fee_bps between 0 and 9999',
  payouts_attempt_check: 'attempt >= 1',
} as const;

/**
 * One payout per booking. Its amounts are frozen when the row is created and never recomputed, so a
 * retry always asks Stripe for the same transfer. Rows are financial records: never deleted.
 */
export const PayoutSchema = defineEntity({
  name: 'Payout',
  tableName: 'payouts',
  checks: Object.entries(PAYOUT_CHECKS).map(([name, expression]) => ({ name, expression })),
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    booking: () => p.oneToOne(BookingSchema).owner().ref().deleteRule('restrict'),
    mentorProfile: () => p.manyToOne(MentorProfileSchema).ref().deleteRule('restrict'),
    grossCents: p.integer(),
    feeBps: p.smallint(),
    feeCents: p.integer(),
    netCents: p.integer(),
    currency: p.string().length(3),
    status: p.string().$type<PayoutStatus>().columnType('text'),
    holdReason: p.string().$type<HoldReason>().columnType('text').nullable(),
    attempt: p.smallint().default(1),
    chargeId: p.text().nullable(),
    transferId: p.text().nullable().unique(),
    failureCode: p.text().nullable(),
    transferredAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date()),
  },
});

export class Payout extends PayoutSchema.class {}

PayoutSchema.setClass(Payout);
