import { describe, expect, it } from 'vitest';
import { bookingReportSchema, REPORT_MESSAGE_MESSAGE } from './booking-report.schema';

describe('bookingReportSchema', () => {
  it('trims the message and drops anything else', () => {
    expect(bookingReportSchema.parse({ message: '  The mentor never answered.  ', refund: true })).toEqual({ message: 'The mentor never answered.' });
    expect(bookingReportSchema.parse({ message: 'x'.repeat(2000) }).message).toHaveLength(2000);
  });

  it.each([{}, { message: 'too short' }, { message: `${'x'.repeat(19)}   ` }, { message: 'x'.repeat(2001) }])('refuses %o with one message', (input) => {
    const result = bookingReportSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([REPORT_MESSAGE_MESSAGE]);
  });
});
