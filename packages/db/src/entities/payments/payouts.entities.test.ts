import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { Booking } from '../bookings/booking.entity';
import { BookingReport } from '../bookings/booking-report.entity';
import { entities } from '../index';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { CONNECT_ACCOUNT_MENTOR_UNIQUE, ConnectAccount, ConnectAccountSchema, ONBOARDING_STATUSES } from './connect-account.entity';
import { HOLD_REASONS, PAYOUT_BOOKING_UNIQUE, PAYOUT_CHECKS, PAYOUT_STATUSES, Payout, PayoutSchema } from './payout.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }));
const accounts = orm.getMetadata().get(ConnectAccount);
const payouts = orm.getMetadata().get(Payout);

afterAll(async () => {
  await orm.close();
});

describe('ConnectAccount entity', () => {
  it('keeps one Express account per mentor with a normalized status only', () => {
    expect(entities).toContain(ConnectAccountSchema);
    expect(accounts.tableName).toBe('connect_accounts');
    expect(ONBOARDING_STATUSES).toEqual(['action_required', 'pending_verification', 'enabled', 'restricted']);
    expect(accounts.properties.mentorProfile.kind).toBe(ReferenceKind.ONE_TO_ONE);
    expect(accounts.properties.mentorProfile.targetMeta?.class).toBe(MentorProfile);
    expect(accounts.properties.mentorProfile.unique).toBe(true);
    expect(accounts.properties.mentorProfile.deleteRule).toBe('restrict');
    expect(CONNECT_ACCOUNT_MENTOR_UNIQUE).toBe('connect_accounts_mentor_profile_id_unique');
    expect(accounts.properties.providerAccountId.unique).toBe(true);
    expect(accounts.checks).toEqual([
      { name: 'connect_accounts_onboarding_status_check', expression: "onboarding_status in ('action_required', 'pending_verification', 'enabled', 'restricted')" },
    ]);
    expect(Object.keys(accounts.properties).sort()).toEqual(['createdAt', 'id', 'lastReconciledAt', 'mentorProfile', 'onboardingStatus', 'providerAccountId', 'updatedAt']);
  });

  it('generates ids and timestamps', () => {
    expect(accounts.properties.id.onCreate?.({} as ConnectAccount, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect(accounts.properties.createdAt.onCreate?.({} as ConnectAccount, orm.em)).toBeInstanceOf(Date);
    expect(accounts.properties.updatedAt.onUpdate?.({} as ConnectAccount, orm.em)).toBeInstanceOf(Date);
  });
});

describe('Payout entity', () => {
  it('is one row per booking with frozen amounts and a closed state machine', () => {
    expect(entities).toContain(PayoutSchema);
    expect(payouts.tableName).toBe('payouts');
    expect(PAYOUT_STATUSES).toEqual(['held', 'transferring', 'transferred', 'failed']);
    expect(HOLD_REASONS).toEqual(['connect_not_enabled', 'disputed', 'charge_reversed']);
    expect(payouts.properties.booking.kind).toBe(ReferenceKind.ONE_TO_ONE);
    expect(payouts.properties.booking.targetMeta?.class).toBe(Booking);
    expect(payouts.properties.booking.unique).toBe(true);
    expect(PAYOUT_BOOKING_UNIQUE).toBe('payouts_booking_id_unique');
    expect(payouts.properties.transferId.unique).toBe(true);
    expect(payouts.properties.attempt.default).toBe(1);
    expect(Object.fromEntries(payouts.checks.map((check) => [check.name, check.expression]))).toEqual(PAYOUT_CHECKS);
    expect(PAYOUT_CHECKS.payouts_amounts_check).toBe('fee_cents + net_cents = gross_cents');
    expect(PAYOUT_CHECKS.payouts_held_check).toBe("(status = 'held') = (hold_reason is not null)");
  });

  it('generates ids and timestamps', () => {
    expect(payouts.properties.id.onCreate?.({} as Payout, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect(payouts.properties.createdAt.onCreate?.({} as Payout, orm.em)).toBeInstanceOf(Date);
    expect(payouts.properties.updatedAt.onUpdate?.({} as Payout, orm.em)).toBeInstanceOf(Date);
  });
});

describe('booking report resolution', () => {
  it('adds a nullable resolved_at', () => {
    const reports = orm.getMetadata().get(BookingReport);

    expect(reports.properties.resolvedAt.nullable).toBe(true);
    expect(reports.properties.resolvedAt.fieldNames).toEqual(['resolved_at']);
  });
});
