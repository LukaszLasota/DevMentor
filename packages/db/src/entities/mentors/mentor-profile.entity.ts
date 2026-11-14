import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';

const now = () => new Date();

/**
 * A mentor's profile, one per user (filled by later stories). Created by the first accepted
 * invitation; goes with its user (`on delete cascade`).
 */
export const MentorProfileSchema = defineEntity({
  name: 'MentorProfile',
  tableName: 'mentor_profiles',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    user: () => p.oneToOne(UserSchema).ref().owner().deleteRule('cascade'),
    /** Set by the first accepted invitation and never reset by a later one. */
    initialPublishDueAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class MentorProfile extends MentorProfileSchema.class {}

MentorProfileSchema.setClass(MentorProfile);
