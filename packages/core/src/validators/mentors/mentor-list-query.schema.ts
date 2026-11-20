import { z } from 'zod';
import { StackTags } from '../../domain/vocabularies/stack-tags';

// `GET /api/mentors?tag=` and the /mentors page (spec 2026-10-21-mentor-list). One tag at a time from
// the one vocabulary (A11); unknown, empty, wrong-case or repeated values fail. No tag lists everyone.

export const UNKNOWN_TAG_MESSAGE = 'Unknown stack tag.';

export const mentorListQuerySchema = z.object({
  tag: StackTags.schema(UNKNOWN_TAG_MESSAGE).optional(),
});

export type MentorListQuery = z.output<typeof mentorListQuerySchema>;
