import { describe, expect, it } from 'vitest';
import { LIST_BIO_MAX, toListItemDto, truncateBio } from './mentor-list-item';
import type { MentorPublicView } from './mentor-profile.service';

const PAGE: MentorPublicView = {
  slug: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  publicWorkUrl: 'https://github.com/ada/engine',
  bio: 'Engines.',
  stackTags: ['python'],
  prices: { price25Cents: 15000, price50Cents: 30000, currency: 'PLN' },
  offerReady: true,
  slots: [{ id: 's1', startsAt: '2026-06-23T09:00:00.000Z', meetsLeadTime: true }],
};
const LIST_KEYS = ['avatarUrl', 'bio', 'displayName', 'nextBookableSlotAt', 'prices', 'publicWorkUrl', 'slug', 'stackTags'];

describe('toListItemDto', () => {
  it('keeps exactly the list allowlist: no slots, offer state or anything private', () => {
    const item = toListItemDto(PAGE, new Date('2026-06-23T09:00:00.000Z'));

    expect(Object.keys(item).sort()).toEqual(LIST_KEYS);
    expect(item).toEqual({
      slug: 'ada',
      displayName: 'Ada',
      avatarUrl: null,
      publicWorkUrl: 'https://github.com/ada/engine',
      bio: 'Engines.',
      stackTags: ['python'],
      prices: { price25Cents: 15000, price50Cents: 30000, currency: 'PLN' },
      nextBookableSlotAt: '2026-06-23T09:00:00.000Z',
    });
  });
});

describe('truncateBio', () => {
  it('leaves a bio of up to 280 characters untouched', () => {
    expect(truncateBio('a'.repeat(LIST_BIO_MAX))).toBe('a'.repeat(LIST_BIO_MAX));
  });

  it('cuts a longer bio on a word boundary with an ellipsis, never above 280', () => {
    const bio = `${'word '.repeat(60)}end`;
    const cut = truncateBio(bio);

    expect(cut.length).toBeLessThanOrEqual(LIST_BIO_MAX);
    expect(cut.endsWith('word…')).toBe(true);
  });

  it('cuts a single long word at the limit', () => {
    expect(truncateBio('x'.repeat(400))).toBe(`${'x'.repeat(LIST_BIO_MAX - 1)}…`);
  });
});
