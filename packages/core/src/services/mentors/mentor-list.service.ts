import { MentorProfile } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import type { MentorListQuery } from '../../validators/mentors/mentor-list-query.schema';
import { toListItemDto, type MentorListItem } from './mentor-list-item';
import { offerState, pageFields, toPublicDto } from './mentor-profile.service';
import { mentorOfferReady, mentorPagePublishable } from './readiness';

type MentorListServiceDeps = Pick<Cradle, 'em' | 'clock' | 'slotService' | 'platformSettingsService'>;

/**
 * The public mentor list (spec 2026-10-21-mentor-list): exactly the mentors for whom
 * `mentorOfferReady` holds at this request's clock, filtered by one stack tag, ordered by
 * `last_published_availability_at DESC, id ASC` (R08; the key informs order, never eligibility).
 * The candidate query only narrows by conditions readiness implies (published, tag); the slot
 * summary, the owner's role and the readiness definition decide. No cap (Q3).
 */
export class MentorListService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly slotService: Cradle['slotService'];
  private readonly platformSettingsService: Cradle['platformSettingsService'];

  constructor({ em, clock, slotService, platformSettingsService }: MentorListServiceDeps) {
    this.em = em;
    this.clock = clock;
    this.slotService = slotService;
    this.platformSettingsService = platformSettingsService;
  }

  async listBookable({ tag }: MentorListQuery = {}): Promise<MentorListItem[]> {
    // One clock reading for the whole request: the two-hour line is the same for every mentor.
    const now = this.clock.now();
    const settings = this.platformSettingsService.tryGet();
    const candidates = await this.em.find(
      MentorProfile,
      { publishedAt: { $ne: null }, ...(tag === undefined ? {} : { stackTags: { $contains: [tag] } }) },
      { populate: ['user'], orderBy: { lastPublishedAvailabilityAt: 'desc', id: 'asc' } },
    );
    const summary = await this.slotService.bookableSummaryFor(
      candidates.map((profile) => profile.id),
      now,
    );
    const items: MentorListItem[] = [];

    for (const profile of candidates) {
      const owner = profile.user.getEntity();
      const next = summary.get(profile.id);
      const listed =
        next !== undefined &&
        owner.roles.includes('mentor') &&
        mentorPagePublishable.isMet(pageFields(profile)) &&
        mentorOfferReady.evaluate(offerState(profile, next.count, settings)).every((item) => item.met);

      if (listed) {
        items.push(toListItemDto(toPublicDto(profile, owner.avatarUrl ?? null, true, [], settings), next.nextStartsAt));
      }
    }

    return items;
  }
}
