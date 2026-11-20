import { defineReadiness } from '../../domain/readiness';

// The one place mentor readiness is declared (spec 2026-10-21-mentor-page, Q7). Later stories add
// requirements here, never a second gate: #24 adds prices to `mentorOfferReady`, #25 adds a slot.

/** What the publish gate reads: the page fields as stored (or as they would be after an edit). */
export interface MentorPageFields {
  displayName: string | null;
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: readonly string[];
}

export const PAGE_REQUIREMENT_MESSAGES = {
  displayName: 'Add a display name.',
  publicWorkUrl: 'Add a link to your public work.',
  bio: 'Write what you have done.',
  stackTags: 'Pick at least one stack tag.',
} as const;

export type MentorPageRequirement = keyof typeof PAGE_REQUIREMENT_MESSAGES;

const filled = (value: string | null) => value !== null && value.trim() !== '';

/** Publishing (and editing a published page) needs all four; keys equal the form field names. */
export const mentorPagePublishable = defineReadiness<MentorPageFields, MentorPageRequirement>([
  { key: 'displayName', message: PAGE_REQUIREMENT_MESSAGES.displayName, met: (page) => filled(page.displayName) },
  { key: 'publicWorkUrl', message: PAGE_REQUIREMENT_MESSAGES.publicWorkUrl, met: (page) => filled(page.publicWorkUrl) },
  { key: 'bio', message: PAGE_REQUIREMENT_MESSAGES.bio, met: (page) => filled(page.bio) },
  { key: 'stackTags', message: PAGE_REQUIREMENT_MESSAGES.stackTags, met: (page) => page.stackTags.length > 0 },
]);

/** What the bookability gate reads; #24 and #25 widen it additively. */
export interface MentorOfferState {
  publishedAt: Date | null;
}

/**
 * The single bookability gate (name fixed by #24): the list (#27), the share page (#28) and booking
 * (#29) read it. This story declares only `published`.
 */
export const mentorOfferReady = defineReadiness<MentorOfferState, 'published'>([
  { key: 'published', message: 'Publish your page.', met: (offer) => offer.publishedAt !== null },
]);
