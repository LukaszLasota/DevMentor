import { describe, expect, it } from 'vitest';
import { cancellationTerms, FREE_CANCELLATION_MS } from './cancellation-terms';

const START = new Date('2026-06-24T12:00:00.000Z');
const at = (msBefore: number) => new Date(START.getTime() - msBefore);

describe('cancellationTerms', () => {
  it('is free strictly more than 24 hours before the start, forfeited from exactly 24 hours', () => {
    const freeUntil = new Date('2026-06-23T12:00:00.000Z');

    expect(cancellationTerms(START, at(FREE_CANCELLATION_MS + 1))).toEqual({ refundDue: true, freeUntil });
    expect(cancellationTerms(START, at(FREE_CANCELLATION_MS))).toEqual({ refundDue: false, freeUntil });
    expect(cancellationTerms(START, at(60_000))).toEqual({ refundDue: false, freeUntil });
  });
});
