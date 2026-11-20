import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { bookingStartSchema, LENGTH_MESSAGE, SLOT_ID_MESSAGE } from './booking-start.schema';

const SLOT_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const errors = (input: unknown) => {
  const result = bookingStartSchema.safeParse(input);

  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};

describe('bookingStartSchema', () => {
  it.each(['25', '50'])('accepts a slot id and the length %s', (length) => {
    expect(bookingStartSchema.parse({ slotId: SLOT_ID, length })).toEqual({ slotId: SLOT_ID, length });
  });

  it('drops unknown keys: a client-sent price never reaches the service', () => {
    expect(bookingStartSchema.parse({ slotId: SLOT_ID, length: '25', priceCents: 1 })).toEqual({ slotId: SLOT_ID, length: '25' });
  });

  it.each([
    ['a non-uuid slot', { slotId: 'nope', length: '25' }, { slotId: [SLOT_ID_MESSAGE] }],
    ['another length', { slotId: SLOT_ID, length: '30' }, { length: [LENGTH_MESSAGE] }],
    ['a numeric length', { slotId: SLOT_ID, length: 25 }, { length: [LENGTH_MESSAGE] }],
    ['nothing', {}, { slotId: [SLOT_ID_MESSAGE], length: [LENGTH_MESSAGE] }],
  ])('refuses %s with one message per field', (_name, input, expected) => {
    expect(errors(input)).toEqual(expected);
  });
});
