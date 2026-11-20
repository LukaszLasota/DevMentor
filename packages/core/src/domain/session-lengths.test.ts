import { describe, expect, it } from 'vitest';
import { priceField, SESSION_LENGTHS } from './session-lengths';

describe('session lengths', () => {
  it('offers 25 and 50 minutes', () => {
    expect([...SESSION_LENGTHS]).toEqual(['25', '50']);
  });

  it('maps each length to its price field', () => {
    expect(priceField('25')).toBe('price25');
    expect(priceField('50')).toBe('price50');
  });
});
