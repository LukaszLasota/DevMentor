import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { User } from '../auth/user.entity';
import { Slot } from '../availability/slot.entity';
import { entities } from '../index';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { ACTIVE_BOOKING_SLOT_UNIQUE, ACTIVE_BOOKING_STATUSES, Booking, BOOKING_STATUSES, BookingSchema, REFUND_STATUSES } from './booking.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(
  createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }),
);
const meta = orm.getMetadata().get(Booking);

afterAll(async () => {
  await orm.close();
});

describe('Booking entity', () => {
  it('is registered and maps to bookings with a uuid key', () => {
    expect(entities).toContain(BookingSchema);
    expect(meta.tableName).toBe('bookings');
    expect(meta.primaryKeys).toEqual(['id']);
    expect(BOOKING_STATUSES).toEqual(['pending_payment', 'confirmed', 'expired', 'failed', 'payment_orphaned', 'cancelled']);
    expect(REFUND_STATUSES).toEqual(['not_due', 'requested', 'pending', 'succeeded', 'failed']);
    expect(ACTIVE_BOOKING_STATUSES).toEqual(['pending_payment', 'confirmed']);
  });

  it('maps every column with its type and nullability', () => {
    const column = (name: keyof typeof meta.properties) => {
      const prop = meta.properties[name];

      return { field: prop.fieldNames[0], type: prop.columnTypes[0], nullable: Boolean(prop.nullable) };
    };

    expect(column('startsAt')).toEqual({ field: 'starts_at', type: 'timestamptz', nullable: false });
    expect(column('endsAt')).toEqual({ field: 'ends_at', type: 'timestamptz', nullable: false });
    expect(column('lengthMinutes')).toEqual({ field: 'length_minutes', type: 'smallint', nullable: false });
    expect(column('priceCents')).toEqual({ field: 'price_cents', type: 'int', nullable: false });
    expect(column('currency')).toEqual({ field: 'currency', type: 'varchar(3)', nullable: false });
    expect(column('status')).toEqual({ field: 'status', type: 'text', nullable: false });
    expect(column('holdExpiresAt')).toEqual({ field: 'hold_expires_at', type: 'timestamptz', nullable: false });
    expect(column('checkoutSessionId')).toEqual({ field: 'checkout_session_id', type: 'text', nullable: true });
    expect(meta.properties.checkoutSessionId.unique).toBe(true);
    expect(column('confirmedAt')).toEqual({ field: 'confirmed_at', type: 'timestamptz', nullable: true });
    expect(column('leadMinutes')).toEqual({ field: 'lead_minutes', type: 'int', nullable: true });
    expect(column('cancelledAt')).toEqual({ field: 'cancelled_at', type: 'timestamptz', nullable: true });
    expect(column('refundStatus')).toEqual({ field: 'refund_status', type: 'text', nullable: true });
    expect(column('refundId')).toEqual({ field: 'refund_id', type: 'text', nullable: true });
    expect(column('feeBps')).toEqual({ field: 'fee_bps', type: 'smallint', nullable: true });
  });

  it.each([
    ['slot', Slot, 'slot_id'],
    ['mentorProfile', MentorProfile, 'mentor_profile_id'],
    ['mentee', User, 'mentee_id'],
  ] as const)('references %s through a restricting foreign key', (name, target, field) => {
    const prop = meta.properties[name];

    expect(prop.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(prop.targetMeta?.class).toBe(target);
    expect(prop.fieldNames).toEqual([field]);
    expect(prop.deleteRule).toBe('restrict');
  });

  it('declares the named partial unique index on the active slot, the lookup index and the CHECKs', () => {
    expect(meta.uniques).toEqual([
      { name: ACTIVE_BOOKING_SLOT_UNIQUE, properties: ['slot'], where: "status in ('pending_payment', 'confirmed')" },
    ]);
    expect(meta.indexes).toEqual([{ name: 'bookings_mentor_profile_status_idx', properties: ['mentorProfile', 'status'] }]);
    expect(meta.checks.map((check) => check.name).sort()).toEqual([
      'bookings_cancelled_check',
      'bookings_confirmed_check',
      'bookings_currency_check',
      'bookings_ends_check',
      'bookings_fee_bps_check',
      'bookings_fee_snapshot_check',
      'bookings_length_check',
      'bookings_price_check',
      'bookings_refund_status_check',
      'bookings_status_check',
    ]);
  });

  it('generates the id and timestamps on create and refreshes updatedAt on update', () => {
    const before = Date.now();

    expect(meta.properties.id.onCreate?.({} as Booking, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect((meta.properties.createdAt.onCreate?.({} as Booking, orm.em) as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((meta.properties.updatedAt.onUpdate?.({} as Booking, orm.em) as Date).getTime()).toBeGreaterThanOrEqual(before);
  });
});
