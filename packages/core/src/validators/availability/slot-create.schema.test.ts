import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { slotCreateSchema, STARTS_AT_MESSAGE } from './slot-create.schema';

const errors = (startsAt: unknown) => {
  const result = slotCreateSchema.safeParse({ startsAt });

  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};

describe('slotCreateSchema', () => {
  it.each(['2026-06-22T16:00Z', '2026-06-22T16:00:00Z', '2026-06-22T16:00:00.000Z', ' 2026-06-22T16:00:00.000Z '])(
    'accepts the whole-minute UTC instant %j',
    (startsAt) => {
      expect(slotCreateSchema.safeParse({ startsAt }).success).toBe(true);
    },
  );

  it.each([
    ['an offset other than Z', '2026-06-22T18:00:00+02:00'],
    ['no zone at all', '2026-06-22T16:00:00'],
    ['non-zero seconds', '2026-06-22T16:00:30Z'],
    ['non-zero milliseconds', '2026-06-22T16:00:00.500Z'],
    ['a date only', '2026-06-22'],
    ['a day that does not exist', '2026-02-30T16:00:00Z'],
    ['an hour that does not exist', '2026-06-22T25:00:00Z'],
    ['garbage', 'tomorrow at four'],
  ])('refuses %s with one message', (_case, startsAt) => {
    expect(errors(startsAt)).toEqual({ startsAt: [STARTS_AT_MESSAGE] });
  });

  it('refuses a missing or non-string start', () => {
    expect(slotCreateSchema.safeParse({}).success).toBe(false);
    expect(slotCreateSchema.safeParse({ startsAt: 1_750_000_000_000 }).success).toBe(false);
  });

  it('drops unknown keys', () => {
    expect(slotCreateSchema.parse({ startsAt: '2026-06-22T16:00Z', mentorProfileId: 'x' })).toEqual({ startsAt: '2026-06-22T16:00Z' });
  });
});
