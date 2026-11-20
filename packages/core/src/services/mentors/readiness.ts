import { defineReadiness } from '../../domain/readiness';
import { withinBounds, type Cents } from '../../money/money';
import type { PlatformSettings } from '../operator/platform-settings.service';

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

/** What the bookability gate reads. */
export interface MentorOfferState {
  publishedAt: Date | null;
  /** Platform currency and bounds, or `null` when unconfigured (#24: unmet, never thrown). */
  settings: PlatformSettings | null;
  price25Cents: number | null;
  price50Cents: number | null;
  /** Future, non-removed slots meeting the two-hour lead time at `clock.now()` (`SlotService.countBookable`). */
  bookableSlots: number;
}

export type MentorOfferRequirement = 'published' | 'settings' | 'price25' | 'price50' | 'hasBookableSlot';

/** Set and within the *current* bounds: tightened bounds make a stored price unmet until re-saved (Q4). */
function priceMet(cents: number | null, length: '25' | '50', settings: PlatformSettings | null): boolean {
  return settings !== null && cents !== null && withinBounds(cents as Cents, settings.bounds[length]);
}

/**
 * The single bookability gate (name fixed by #24): the list (#27), the share page (#28) and booking
 * (#29) read it. #23 declared `published`; #24 adds `settings`, `price25`, `price50` (keys equal the
 * price form fields); #25 adds `hasBookableSlot` (a slot within two hours does not count).
 */
export const mentorOfferReady = defineReadiness<MentorOfferState, MentorOfferRequirement>([
  { key: 'published', message: 'Publish your page.', met: (offer) => offer.publishedAt !== null },
  { key: 'settings', message: 'Prices cannot be set right now.', met: (offer) => offer.settings !== null },
  {
    key: 'price25',
    message: 'Set a 25-minute price within the allowed range.',
    met: (offer) => priceMet(offer.price25Cents, '25', offer.settings),
  },
  {
    key: 'price50',
    message: 'Set a 50-minute price within the allowed range.',
    met: (offer) => priceMet(offer.price50Cents, '50', offer.settings),
  },
  {
    key: 'hasBookableSlot',
    message: 'Publish a slot at least two hours ahead.',
    met: (offer) => offer.bookableSlots > 0,
  },
]);
