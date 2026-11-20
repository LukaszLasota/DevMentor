import { describe, expect, it } from 'vitest';
import { bookingCancelSchema, EXPECT_REFUND_MESSAGE } from './booking-cancel.schema';

describe('bookingCancelSchema', () => {
  it('accepts the shown terms and drops anything else', () => {
    expect(bookingCancelSchema.parse({ expectRefund: true, refundCents: 1 })).toEqual({ expectRefund: true });
    expect(bookingCancelSchema.parse({ expectRefund: false })).toEqual({ expectRefund: false });
  });

  it.each([{}, { expectRefund: 'yes' }])('refuses %o with one message', (input) => {
    const result = bookingCancelSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([EXPECT_REFUND_MESSAGE]);
  });
});
