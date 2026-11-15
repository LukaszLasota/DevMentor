import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from './clock';

describe('systemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current system time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));

    expect(systemClock.now()).toEqual(new Date('2026-10-26T12:00:00Z'));
  });
});
