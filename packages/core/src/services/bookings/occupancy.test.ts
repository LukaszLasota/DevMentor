import { describe, expect, it } from 'vitest';
import { endOf, freeLengths, overlaps } from './occupancy';

const at = (time: string) => new Date(`2026-06-23T${time}:00.000Z`);
const busy = (from: string, to: string) => ({ startsAt: at(from), endsAt: at(to) });

describe('occupancy', () => {
  it('ends a session after its length', () => {
    expect(endOf(at('14:00'), '25')).toEqual(at('14:25'));
    expect(endOf(at('14:00'), '50')).toEqual(at('14:50'));
  });

  it('treats intervals as half-open', () => {
    expect(overlaps(busy('14:00', '14:25'), busy('14:25', '14:50'))).toBe(false);
    expect(overlaps(busy('14:00', '14:26'), busy('14:25', '14:50'))).toBe(true);
    expect(overlaps(busy('14:30', '14:40'), busy('14:00', '15:00'))).toBe(true);
  });

  it('offers both lengths when nothing is busy', () => {
    expect(freeLengths(at('14:00'), [])).toEqual(['25', '50']);
  });

  it('offers only 25 when a booking starts at 14:30 (a 50 from 14:00 would overlap it)', () => {
    expect(freeLengths(at('14:00'), [busy('14:30', '14:55')])).toEqual(['25']);
  });

  it('offers both when the next booking starts exactly at the 50-minute end', () => {
    expect(freeLengths(at('14:00'), [busy('14:50', '15:15')])).toEqual(['25', '50']);
  });

  it('offers nothing on a slot inside or at the start of a booking', () => {
    expect(freeLengths(at('14:00'), [busy('14:00', '14:25')])).toEqual([]);
    expect(freeLengths(at('14:30'), [busy('14:00', '14:50')])).toEqual([]);
    expect(freeLengths(at('14:00'), [busy('13:50', '14:15')])).toEqual([]);
  });
});
