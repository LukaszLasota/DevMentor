import { describe, expect, it } from 'vitest';
import { mentorOfferReady, mentorPagePublishable } from './readiness';

describe('mentorPagePublishable', () => {
  it('needs a display name, a public-work link, a bio and a tag; keys equal the form field names', () => {
    expect(mentorPagePublishable.keys).toEqual(['displayName', 'publicWorkUrl', 'bio', 'stackTags']);
    expect(
      mentorPagePublishable.evaluate({ displayName: '  ', publicWorkUrl: null, bio: 'Engines.', stackTags: ['react'] }),
    ).toEqual([
      { key: 'displayName', met: false },
      { key: 'publicWorkUrl', met: false },
      { key: 'bio', met: true },
      { key: 'stackTags', met: true },
    ]);
  });
});

describe('mentorOfferReady', () => {
  const SETTINGS = {
    currency: 'PLN',
    bounds: { '25': { minCents: 5000, maxCents: 30000 }, '50': { minCents: 10000, maxCents: 60000 } },
  };
  const READY = { publishedAt: new Date(), settings: SETTINGS, price25Cents: 15000, price50Cents: 30000, bookableSlots: 1 };
  const unmet = (state: Partial<typeof READY> | Record<string, unknown>) =>
    mentorOfferReady
      .evaluate({ ...READY, ...state } as typeof READY)
      .filter((item) => !item.met)
      .map((item) => item.key);

  it('needs a published page, settings, both prices within the current bounds and a bookable slot', () => {
    expect(mentorOfferReady.keys).toEqual(['published', 'settings', 'price25', 'price50', 'hasBookableSlot']);
    expect(mentorOfferReady.isMet(READY)).toBe(true);
    expect(unmet({ publishedAt: null })).toEqual(['published']);
    expect(unmet({ bookableSlots: 0 })).toEqual(['hasBookableSlot']);
  });

  it('reports missing settings as unmet (no exception), which also leaves both prices unmet', () => {
    expect(unmet({ settings: null })).toEqual(['settings', 'price25', 'price50']);
  });

  it.each([
    ['a missing 25-minute price', { price25Cents: null }, ['price25']],
    ['a 50-minute price above the bound', { price50Cents: 60001 }, ['price50']],
    ['a 25-minute price below the bound', { price25Cents: 4999 }, ['price25']],
  ])('is unmet with %s', (_case, state, keys) => {
    expect(unmet(state)).toEqual(keys);
  });

  it('accepts prices exactly at the bounds', () => {
    expect(unmet({ price25Cents: 5000, price50Cents: 60000 })).toEqual([]);
  });
});
