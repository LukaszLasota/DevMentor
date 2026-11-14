import { MentorProfile } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { MentorProfileService } from './mentor-profile.service';

const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const DUE = new Date('2026-11-28T12:00:00.000Z');

function setup(profile: Partial<MentorProfile> | null) {
  const em = { findOne: vi.fn(async () => (profile === null ? null : Object.assign(new MentorProfile(), profile))) };

  return { em, service: new MentorProfileService({ em: em as unknown as Cradle['em'] }) };
}

describe('MentorProfileService.publishDueAt', () => {
  it("reads the user's profile and returns its initial publish-by date", async () => {
    const { em, service } = setup({ initialPublishDueAt: DUE });

    await expect(service.publishDueAt(USER_ID)).resolves.toBe(DUE);
    expect(em.findOne).toHaveBeenCalledWith(MentorProfile, { user: USER_ID });
  });

  it.each([
    ['no profile', null],
    ['no date on the profile', { initialPublishDueAt: null }],
  ])('returns null with %s', async (_case, profile) => {
    const { service } = setup(profile);

    await expect(service.publishDueAt(USER_ID)).resolves.toBeNull();
  });
});
