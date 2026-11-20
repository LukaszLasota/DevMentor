import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AMOUNT_MESSAGE, mentorPricesUpdateSchema } from './mentor-prices-update.schema';

const errors = (input: unknown) => {
  const result = mentorPricesUpdateSchema.safeParse(input);

  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};

describe('mentorPricesUpdateSchema', () => {
  it.each(['150', '150.5', '150.50', '0', '0.01', '99999999999999999999'])('accepts %j as a string', (price) => {
    expect(mentorPricesUpdateSchema.parse({ price25: price, price50: '300' })).toEqual({ price25: price, price50: '300' });
  });

  it.each(['20.005', '-5', '1e3', '1,000', ' 20', '20 ', '01', '20.', '.5', '', '150 PLN'])('refuses %j with one message', (price) => {
    expect(errors({ price25: price, price50: '300' })).toEqual({ price25: [AMOUNT_MESSAGE] });
  });

  it('needs both prices as strings and drops unknown keys', () => {
    expect(Object.keys(errors({ price25: 150 })).sort()).toEqual(['price25', 'price50']);
    expect(mentorPricesUpdateSchema.parse({ price25: '1', price50: '2', currency: 'USD' })).toEqual({ price25: '1', price50: '2' });
  });
});
