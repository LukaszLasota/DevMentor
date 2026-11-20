import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';
import { STACK_TAGS, type StackTag } from '../invitations/invitation.entity';

const now = () => new Date();

/** Width of `display_name`. */
export const DISPLAY_NAME_MAX_LENGTH = 80;
/** Width of `slug` (also the slug rules' cap in `@devmentor/core`). */
export const SLUG_COLUMN_LENGTH = 60;
/** Longest `bio`, enforced by a CHECK. */
export const BIO_MAX_LENGTH = 2000;

/** Named so the service can retry a slug collision on exactly this constraint. */
export const MENTOR_PROFILE_SLUG_KEY = 'mentor_profiles_slug_key';

/**
 * Only beachhead tags, no null members; empty is allowed (a draft). Duplicates are normalized by
 * `MentorProfileService`. The literal is held equal to `StackTags` in core by its drift test.
 */
export const MENTOR_STACK_TAGS_CHECK =
  'array_position(stack_tags, null) is null' +
  ` and stack_tags <@ array[${STACK_TAGS.map((tag) => `'${tag}'`).join(', ')}]::text[]`;

export const BIO_LENGTH_CHECK = `bio is null or char_length(bio) <= ${BIO_MAX_LENGTH}`;

/** A published page always has its share link. */
export const PUBLISHED_SLUG_CHECK = 'published_at is null or slug is not null';

/**
 * A mentor's page, one per user. Created empty by the first accepted invitation; goes with its user
 * (`on delete cascade`). Filled by the mentor (spec 2026-10-21-mentor-page): saving a draft is always
 * allowed, publishing is gated in `MentorProfileService`. `slug` is set once, on the first publish,
 * and never changes; `published_at` set means the page is public.
 */
export const MentorProfileSchema = defineEntity({
  name: 'MentorProfile',
  tableName: 'mentor_profiles',
  checks: [
    { name: 'mentor_profiles_stack_tags_check', expression: MENTOR_STACK_TAGS_CHECK },
    { name: 'mentor_profiles_bio_length_check', expression: BIO_LENGTH_CHECK },
    { name: 'mentor_profiles_published_slug_check', expression: PUBLISHED_SLUG_CHECK },
  ],
  uniques: [{ name: MENTOR_PROFILE_SLUG_KEY, properties: ['slug'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    user: () => p.oneToOne(UserSchema).ref().owner().deleteRule('cascade'),
    /** Set by the first accepted invitation and never reset by a later one. */
    initialPublishDueAt: p.datetime().nullable(),
    displayName: p.string().length(DISPLAY_NAME_MAX_LENGTH).nullable(),
    publicWorkUrl: p.text().nullable(),
    bio: p.text().nullable(),
    stackTags: p.array<StackTag>().default([]),
    slug: p.string().length(SLUG_COLUMN_LENGTH).nullable(),
    publishedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(now),
    updatedAt: p.datetime().onCreate(now).onUpdate(now),
  },
});

export class MentorProfile extends MentorProfileSchema.class {
  // A fresh array per instance: MikroORM assigns a property's `default` by reference (lesson 2026-10-26).
  override stackTags: InstanceType<typeof MentorProfileSchema.class>['stackTags'] = [];
}

MentorProfileSchema.setClass(MentorProfile);
