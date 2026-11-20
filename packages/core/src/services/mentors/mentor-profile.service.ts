import { LockMode, MENTOR_PROFILE_SLUG_KEY, MentorProfile, UniqueConstraintViolationException, User } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { isReservedSlug, SLUG_MAX_LENGTH, slugCandidate, slugify } from '../../domain/slug';
import type { RequirementResult } from '../../domain/readiness';
import type { StackTagKey } from '../../domain/vocabularies/stack-tags';
import { ConflictError, NotFoundError } from '../../http/errors';
import type { MentorProfileUpdateInput } from '../../validators/mentors/mentor-profile-update.schema';
import type { SlotView } from '../availability/slot.service';
import {
  mentorOfferReady,
  mentorPagePublishable,
  type MentorOfferRequirement,
  type MentorOfferState,
  type MentorPageFields,
  type MentorPageRequirement,
} from './readiness';

export const PROFILE_NOT_FOUND_MESSAGE = 'Mentor profile not found.';
export const PAGE_NOT_FOUND_MESSAGE = 'Mentor page not found.';
export const NOT_PUBLISHABLE_MESSAGE = 'Your page is not ready to publish yet.';
export const PUBLISHED_EDIT_MESSAGE = 'A published page needs all four items; nothing was saved.';
export const SLUG_CONFLICT_MESSAGE = 'Could not reserve a link for your page. Try again.';

/** Publish attempts before giving up with 409 (one candidate per transaction). */
export const MAX_SLUG_ATTEMPTS = 100;

const SLUG_FORMAT = new RegExp(`^[a-z0-9-]{1,${SLUG_MAX_LENGTH}}$`);

/**
 * What anyone with the link sees: an explicit allowlist, never the entity. Mirrored by
 * `MentorPageViewProps` in `@devmentor/ui` (which adds #24/#25 fields); #24 and #25 extend it additively.
 */
export interface MentorPublicView {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  publicWorkUrl: string;
  bio: string;
  stackTags: StackTagKey[];
  /** `mentorOfferReady` at request time (#25). */
  offerReady: boolean;
  /** Future slots with their lead-time state; empty unless `offerReady` (Q4 of #27/#28). */
  slots: SlotView[];
}

/** What the mentor sees about their own page; dates as ISO 8601. */
export interface MentorOwnerView {
  slug: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: StackTagKey[];
  publishedAt: string | null;
  initialPublishDueAt: string | null;
  /** The publish gate, in checklist order. */
  readiness: RequirementResult<MentorPageRequirement>[];
  /** The bookability gate at request time (`/mentor` steps), in checklist order. */
  offerReadiness: RequirementResult<MentorOfferRequirement>[];
}

function pageFields(profile: MentorProfile): MentorPageFields {
  return {
    displayName: profile.displayName ?? null,
    publicWorkUrl: profile.publicWorkUrl ?? null,
    bio: profile.bio ?? null,
    stackTags: profile.stackTags,
  };
}

function offerState(profile: MentorProfile, bookableSlots: number): MentorOfferState {
  return { publishedAt: profile.publishedAt ?? null, bookableSlots };
}

export function toOwnerDto(profile: MentorProfile, avatarUrl: string | null, bookableSlots: number): MentorOwnerView {
  return {
    slug: profile.slug ?? null,
    displayName: profile.displayName ?? null,
    avatarUrl,
    publicWorkUrl: profile.publicWorkUrl ?? null,
    bio: profile.bio ?? null,
    stackTags: [...profile.stackTags],
    publishedAt: profile.publishedAt?.toISOString() ?? null,
    initialPublishDueAt: profile.initialPublishDueAt?.toISOString() ?? null,
    readiness: mentorPagePublishable.evaluate(pageFields(profile)),
    offerReadiness: mentorOfferReady.evaluate(offerState(profile, bookableSlots)),
  };
}

/** Only called for a published, complete page (`getPublicBySlug` checks both). */
export function toPublicDto(
  profile: MentorProfile,
  avatarUrl: string | null,
  offerReady: boolean,
  slots: SlotView[],
): MentorPublicView {
  return {
    slug: profile.slug as string,
    displayName: profile.displayName as string,
    avatarUrl,
    publicWorkUrl: profile.publicWorkUrl as string,
    bio: profile.bio as string,
    stackTags: [...profile.stackTags],
    offerReady,
    slots: offerReady ? slots : [],
  };
}

/** `SELECT … FOR UPDATE` that re-reads the row (lesson 2026-10-26); built at call time. */
function lockForUpdate() {
  return { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as const;
}

function isSlugCollision(error: unknown): boolean {
  return (
    error instanceof UniqueConstraintViolationException &&
    (error as { constraint?: string }).constraint === MENTOR_PROFILE_SLUG_KEY
  );
}

type PublishStep = { kind: 'done'; profile: MentorProfile; published: boolean } | { kind: 'reserved' };

/**
 * Mentor pages (spec 2026-10-21-mentor-page): the owner edits, publishes and unpublishes their one
 * profile; anyone reads a published page by slug. The owner id always comes from the session. Every
 * writer holds the profile row `FOR UPDATE`, so an edit cannot race a publish into an incomplete
 * public page and two publishes of one profile yield one slug and one event.
 */
export class MentorProfileService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly events: Cradle['events'];
  private readonly slotService: Cradle['slotService'];

  constructor({ em, clock, events, slotService }: Pick<Cradle, 'em' | 'clock' | 'events' | 'slotService'>) {
    this.em = em;
    this.clock = clock;
    this.events = events;
    this.slotService = slotService;
  }

  /**
   * The owner's page, or `null` without a profile (e.g. `mentor` granted by hand): `/mentor` reads the
   * publish-by date ("Publish at least one bookable session by <date>", R13, D13) and the page step.
   */
  async findOwn(userId: string): Promise<MentorOwnerView | null> {
    const profile = await this.em.findOne(MentorProfile, { user: userId });

    if (profile === null) {
      return null;
    }

    return this.ownerView(profile, userId);
  }

  /** The owner's page; 404 without a profile (never created implicitly on read). */
  async getOwn(userId: string): Promise<MentorOwnerView> {
    const own = await this.findOwn(userId);

    if (own === null) {
      throw new NotFoundError(PROFILE_NOT_FOUND_MESSAGE);
    }

    return own;
  }

  /**
   * Saves the given fields (omitted = unchanged, `null` = cleared). A draft saves anything the
   * schema allows; on a published page the merged result must still pass the publish gate (400 with
   * the cleared field named, nothing saved).
   */
  async updateOwn(userId: string, input: MentorProfileUpdateInput): Promise<MentorOwnerView> {
    const profile = await this.em.transactional(async (em) => {
      const locked = await this.lockOwn(em, userId);
      const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
      const merged = { ...pageFields(locked), ...changes } as MentorPageFields;

      if (locked.publishedAt != null) {
        mentorPagePublishable.assert(merged, PUBLISHED_EDIT_MESSAGE);
      }

      return em.assign(locked, changes);
    });

    return await this.ownerView(profile, userId);
  }

  /**
   * Publishes the page once the gate passes (400 with `fieldErrors` per missing item). The first
   * publish reserves a slug from the display name: one candidate per transaction, retried only when
   * `mentor_profiles_slug_key` refuses it, up to `MAX_SLUG_ATTEMPTS` (then 409, retryable).
   * `mentors.profile.published` goes out after the commit, only when this call made the page public.
   */
  async publish(userId: string): Promise<MentorOwnerView> {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      let step: PublishStep;

      try {
        step = await this.em.transactional((em) => this.publishOnce(em, userId, attempt));
      } catch (error) {
        if (!isSlugCollision(error)) {
          throw error;
        }

        // Drop the failed write from the unit of work; the next attempt re-reads under the lock.
        this.em.clear();
        continue;
      }

      if (step.kind === 'reserved') {
        continue;
      }

      const { profile, published } = step;

      if (published) {
        await this.events.emit('mentors.profile.published', { mentorProfileId: profile.id, slug: profile.slug as string });
      }

      return await this.ownerView(profile, userId);
    }

    throw new ConflictError(SLUG_CONFLICT_MESSAGE);
  }

  /** Hides the page (true 404) and keeps its slug for a later republish. */
  async unpublish(userId: string): Promise<MentorOwnerView> {
    const profile = await this.em.transactional(async (em) => {
      const locked = await this.lockOwn(em, userId);

      return em.assign(locked, { publishedAt: null });
    });

    return await this.ownerView(profile, userId);
  }

  /**
   * A published page by slug, else `null`: unknown, unpublished, incomplete, or its owner no longer
   * holds `mentor` (fail closed). The slug format is checked before any query. `/m/[slug]` calls it
   * before streaming starts, so a `null` becomes a true HTTP 404.
   */
  async findPublicBySlug(slug: string): Promise<MentorPublicView | null> {
    if (!SLUG_FORMAT.test(slug)) {
      return null;
    }

    const profile = await this.em.findOne(MentorProfile, { slug, publishedAt: { $ne: null } }, { populate: ['user'] });
    const owner = profile?.user.getEntity();

    if (
      profile == null ||
      owner === undefined ||
      !owner.roles.includes('mentor') ||
      !mentorPagePublishable.isMet(pageFields(profile))
    ) {
      return null;
    }

    const now = this.clock.now();
    const offerReady = mentorOfferReady.isMet(offerState(profile, await this.slotService.countBookable(profile.id, now)));
    const slots = offerReady ? await this.slotService.listPublicFor(profile.id, now) : [];

    return toPublicDto(profile, owner.avatarUrl ?? null, offerReady, slots);
  }

  /** `findPublicBySlug` for the API: 404 for every page that is not public. */
  async getPublicBySlug(slug: string): Promise<MentorPublicView> {
    const page = await this.findPublicBySlug(slug);

    if (page === null) {
      throw new NotFoundError(PAGE_NOT_FOUND_MESSAGE);
    }

    return page;
  }

  private async publishOnce(em: Cradle['em'], userId: string, attempt: number): Promise<PublishStep> {
    const locked = await this.lockOwn(em, userId);

    // Already public (a second tab, a concurrent publish that won the lock): no change, no event.
    if (locked.publishedAt != null) {
      return { kind: 'done', profile: locked, published: false };
    }

    mentorPagePublishable.assert(pageFields(locked), NOT_PUBLISHABLE_MESSAGE);

    if (locked.slug == null) {
      const candidate = slugCandidate(slugify(locked.displayName as string), attempt);

      if (isReservedSlug(candidate)) {
        return { kind: 'reserved' };
      }

      locked.slug = candidate;
    }

    locked.publishedAt = this.clock.now();

    return { kind: 'done', profile: locked, published: true };
  }

  private async lockOwn(em: Cradle['em'], userId: string): Promise<MentorProfile> {
    const profile = await em.findOne(MentorProfile, { user: userId }, lockForUpdate());

    if (profile === null) {
      throw new NotFoundError(PROFILE_NOT_FOUND_MESSAGE);
    }

    return profile;
  }

  private async ownerView(profile: MentorProfile, userId: string): Promise<MentorOwnerView> {
    const bookableSlots = await this.slotService.countBookable(profile.id, this.clock.now());

    return toOwnerDto(profile, await this.avatarOf(userId), bookableSlots);
  }

  private async avatarOf(userId: string): Promise<string | null> {
    const user = await this.em.findOne(User, { id: userId });

    return user?.avatarUrl ?? null;
  }
}
