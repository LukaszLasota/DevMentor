import { describe, expect, it } from 'vitest';
import { formatMoney, parseMajorAmount, toMajorString, withinBounds, type Cents } from './money';

describe('parseMajorAmount', () => {
  it.each([
    ['0', 0],
    ['20', 2000],
    ['20.5', 2050],
    ['20.00', 2000],
    ['0.01', 1],
    ['0.1', 10],
    ['150.99', 15099],
  ])('converts %s to %d cents', (input, cents) => {
    expect(parseMajorAmount(input)).toBe(cents);
  });

  it.each(['20.005', '-5', '1e3', '1,000', ' 20', '', '01', '20.', '.5'])('rejects %j', (input) => {
    expect(() => parseMajorAmount(input)).toThrow(`Not a major-unit amount: ${input}`);
  });

  it('parses a long digit string exactly while it is a safe integer', () => {
    expect(parseMajorAmount('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('returns Infinity (above every bound) beyond the safe range', () => {
    expect(parseMajorAmount('90071992547409.92')).toBe(Number.POSITIVE_INFINITY);
    expect(parseMajorAmount('9'.repeat(400))).toBe(Number.POSITIVE_INFINITY);
    expect(withinBounds(parseMajorAmount('9'.repeat(400)), { minCents: 0, maxCents: Number.MAX_SAFE_INTEGER })).toBe(
      false,
    );
  });
});

describe('withinBounds', () => {
  const bounds = { minCents: 1000, maxCents: 5000 };

  it('is inclusive at both ends', () => {
    expect(withinBounds(1000 as Cents, bounds)).toBe(true);
    expect(withinBounds(5000 as Cents, bounds)).toBe(true);
  });

  it('rejects one cent outside', () => {
    expect(withinBounds(999 as Cents, bounds)).toBe(false);
    expect(withinBounds(5001 as Cents, bounds)).toBe(false);
  });

  it('accepts values inside', () => {
    expect(withinBounds(3000 as Cents, bounds)).toBe(true);
  });
});

describe('formatMoney', () => {
  it('formats in en-US with the currency code', () => {
    expect(formatMoney(15000, 'PLN').replace(/\s/g, ' ')).toBe('PLN 150.00');
    expect(formatMoney(2050, 'USD')).toBe('$20.50');
  });
});

describe('toMajorString', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [2050, '20.50'],
    [30000, '300.00'],
  ])('renders %d cents as %s', (cents, text) => {
    expect(toMajorString(cents)).toBe(text);
  });
});
