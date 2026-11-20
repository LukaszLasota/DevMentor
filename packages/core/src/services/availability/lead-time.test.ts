import { describe, expect, it } from 'vitest';
import { BOOKING_LEAD_TIME_MINUTES, horizonFrom, MAX_ACTIVE_FUTURE_SLOTS, MAX_HORIZON_DAYS, meetsLeadTime, PAST_LIST_LIMIT } from './lead-time';

const NOW = new Date('2026-06-22T16:00:00.000Z');

describe('meetsLeadTime (R09)', () => {
  it('is true from exactly two hours ahead (inclusive) and false one millisecond earlier', () => {
    expect(meetsLeadTime(new Date('2026-06-22T18:00:00.000Z'), NOW)).toBe(true);
    expect(meetsLeadTime(new Date('2026-06-22T17:59:59.999Z'), NOW)).toBe(false);
    expect(meetsLeadTime(new Date('2026-06-23T09:00:00.000Z'), NOW)).toBe(true);
  });

  it('is false once the clock moves past two hours before the start', () => {
    expect(meetsLeadTime(new Date('2026-06-22T18:00:00.000Z'), new Date('2026-06-22T16:00:00.001Z'))).toBe(false);
  });
});

describe('availability constants', () => {
  it('fixes the product rules', () => {
    expect([BOOKING_LEAD_TIME_MINUTES, MAX_ACTIVE_FUTURE_SLOTS, MAX_HORIZON_DAYS, PAST_LIST_LIMIT]).toEqual([120, 200, 365, 50]);
    expect(horizonFrom(NOW).toISOString()).toBe('2027-06-22T16:00:00.000Z');
  });
});
