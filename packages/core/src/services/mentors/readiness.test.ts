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
  it('declares only "published" in this story (#24 and #25 add prices and a slot)', () => {
    expect(mentorOfferReady.keys).toEqual(['published']);
    expect(mentorOfferReady.isMet({ publishedAt: new Date() })).toBe(true);
    expect(mentorOfferReady.isMet({ publishedAt: null })).toBe(false);
  });
});
