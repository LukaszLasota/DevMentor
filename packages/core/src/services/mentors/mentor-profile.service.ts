import { MentorProfile } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';

/**
 * Mentor profiles (spec 2026-10-21-mentor-invitations; filled by #23–#26). For now only the mentor
 * home reads it: the publish-by date stored by the first accepted invitation.
 */
export class MentorProfileService {
  private readonly em: Cradle['em'];

  constructor({ em }: Pick<Cradle, 'em'>) {
    this.em = em;
  }

  /**
   * "Publish at least one bookable session by <date>" (R13, D13): `initialPublishDueAt` of the
   * user's profile, `null` without a profile or a date (e.g. `mentor` granted by hand).
   */
  async publishDueAt(userId: string): Promise<Date | null> {
    const profile = await this.em.findOne(MentorProfile, { user: userId });

    return profile?.initialPublishDueAt ?? null;
  }
}
