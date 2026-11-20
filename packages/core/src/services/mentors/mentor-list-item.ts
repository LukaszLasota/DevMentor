import type { MentorPrices, MentorPublicView } from './mentor-profile.service';

/** Longest bio on a list card; the full bio stays on `/m/<slug>` (spec 2026-10-21-mentor-list). */
export const LIST_BIO_MAX = 280;

/**
 * One row of `/mentors` and `GET /api/mentors`: an explicit allowlist — #23's public page fields
 * (bio truncated), #24's prices and one derived instant. Never ids, emails, dates of publication,
 * readiness, bounds, slot lists or counts.
 */
export interface MentorListItem {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  publicWorkUrl: string;
  bio: string;
  stackTags: MentorPublicView['stackTags'];
  prices: MentorPrices;
  /** ISO instant of the earliest slot meeting the two-hour lead time. */
  nextBookableSlotAt: string;
}

/** At most 280 characters, cut on a word boundary with an ellipsis; a shorter bio is untouched. */
export function truncateBio(bio: string, max = LIST_BIO_MAX): string {
  if (bio.length <= max) {
    return bio;
  }

  const head = bio.slice(0, max - 1);
  const space = head.lastIndexOf(' ');

  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}

/**
 * Built from the public projection of an offer-ready mentor (`toPublicDto`, so avatar, role and key
 * rules are #23's), never from the entity; `prices` is non-null there because readiness requires both.
 */
export function toListItemDto(page: MentorPublicView, nextBookableSlotAt: Date): MentorListItem {
  const { slug, displayName, avatarUrl, publicWorkUrl, bio, stackTags, prices } = page;

  return {
    slug,
    displayName,
    avatarUrl,
    publicWorkUrl,
    bio: truncateBio(bio),
    stackTags,
    prices: prices as MentorPrices,
    nextBookableSlotAt: nextBookableSlotAt.toISOString(),
  };
}
