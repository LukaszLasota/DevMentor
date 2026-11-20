import { describe, expect, it } from 'vitest';
import { isReservedSlug, SLUG_MAX_LENGTH, slugCandidate, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Ada Lovelace', 'ada-lovelace'],
    ['Zoë Øster-Łódź', 'zoe-oster-lodz'],
    ['Łukasz Żółć', 'lukasz-zolc'],
    ['Æsir Straße Þór Œuvre Đorđe Iğdır', 'aesir-strasse-thor-oeuvre-dorde-igdir'],
    ['  José  María  ', 'jose-maria'],
    ["O'Brien & Co. (2026)", 'o-brien-co-2026'],
    ['Me', 'me'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it.each(['🚀🔥', '!!!', ''])('falls back to "mentor" for %j', (name) => {
    expect(slugify(name)).toBe('mentor');
  });
});

describe('slugCandidate', () => {
  it('uses the base first, then base-n', () => {
    expect(slugCandidate('ada-lovelace', 1)).toBe('ada-lovelace');
    expect(slugCandidate('ada-lovelace', 2)).toBe('ada-lovelace-2');
    expect(slugCandidate('me', 2)).toBe('me-2');
  });

  it('cuts the base so the candidate never exceeds 60 characters', () => {
    const base = 'a'.repeat(70);

    expect(slugCandidate(base, 1)).toBe('a'.repeat(SLUG_MAX_LENGTH));
    expect(slugCandidate(base, 2)).toBe(`${'a'.repeat(58)}-2`);
    expect(slugCandidate(base, 100)).toBe(`${'a'.repeat(56)}-100`);
    expect(slugCandidate(base, 100)).toHaveLength(SLUG_MAX_LENGTH);
  });

  it('drops a dash left at the cut before adding the suffix', () => {
    const base = `${'a'.repeat(57)}-bbbb`;

    expect(slugCandidate(base, 2)).toBe(`${'a'.repeat(57)}-2`);
    expect(slugCandidate(`${'a'.repeat(59)}-b`, 1)).toBe('a'.repeat(59));
  });
});

describe('isReservedSlug', () => {
  it('reserves only "me", checked on the final candidate', () => {
    expect(isReservedSlug('me')).toBe(true);
    expect(isReservedSlug(slugCandidate(slugify('Me'), 2))).toBe(false);
    expect(isReservedSlug('mentor')).toBe(false);
  });
});
