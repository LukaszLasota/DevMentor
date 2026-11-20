// Client-safe slug rules (spec 2026-10-21-mentor-page, API Contracts): pure functions only; the
// service owns persistence and retries.

/** Longest slug, also the `mentor_profiles.slug` column width. */
export const SLUG_MAX_LENGTH = 60;

/** Base when a display name has no letters or digits (only emoji or punctuation). */
export const SLUG_FALLBACK = 'mentor';

/**
 * Slugs that would collide with a route: `/api/mentors/me` shadows `/api/mentors/[slug]`.
 * `/m/<slug>` has no sibling routes, so nothing else is reserved.
 */
export const RESERVED_SLUGS: readonly string[] = ['me'];

/** `"Zoë O'Brien"` → `zoe-o-brien`: NFKD, combining marks stripped, lower case, runs of other characters → one dash. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? SLUG_FALLBACK : slug;
}

/**
 * Candidate for publish attempt `attempt` (1-based): attempt 1 is `base`, attempt n is `base-n`. The
 * base is cut so the candidate never exceeds `SLUG_MAX_LENGTH`, without a dash left before the suffix.
 */
export function slugCandidate(base: string, attempt: number): string {
  const suffix = attempt === 1 ? '' : `-${attempt}`;
  const head = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '');

  return `${head}${suffix}`;
}

/** Checked on the final (cut, suffixed) candidate. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}
