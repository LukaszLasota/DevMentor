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
  it('needs a published page and a bookable slot (#24 adds prices)', () => {
    expect(mentorOfferReady.keys).toEqual(['published', 'hasBookableSlot']);
    expect(mentorOfferReady.isMet({ publishedAt: new Date(), bookableSlots: 1 })).toBe(true);
    expect(mentorOfferReady.evaluate({ publishedAt: new Date(), bookableSlots: 0 })).toEqual([
      { key: 'published', met: true },
      { key: 'hasBookableSlot', met: false },
    ]);
    expect(mentorOfferReady.isMet({ publishedAt: null, bookableSlots: 3 })).toBe(false);
  });
});
