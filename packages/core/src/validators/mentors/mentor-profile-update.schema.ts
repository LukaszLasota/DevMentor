import { z } from 'zod';
import { MAX_STACK_TAGS, StackTags } from '../../domain/vocabularies/stack-tags';

// `PUT /api/mentors/me` and the /mentor/profile form (spec 2026-10-21-mentor-page). Shape only:
// every field is optional (omitted = unchanged) and an empty string clears it to `null`; whether
// the page is complete enough to publish is the readiness gate's job, not this schema's.

export const DISPLAY_NAME_MAX = 80;
export const PUBLIC_WORK_URL_MAX = 2048;
export const BIO_MAX = 2000;

export const DISPLAY_NAME_MESSAGE = `Enter a display name of up to ${DISPLAY_NAME_MAX} characters.`;
export const PUBLIC_WORK_URL_MESSAGE =
  'Enter a full link that starts with http:// or https://, without a username or password.';
export const BIO_MESSAGE = 'Keep it to 2,000 characters.';
export const STACK_TAG_MESSAGE = 'Pick from TypeScript, React, Python and AI agents.';
export const STACK_TAGS_MAX_MESSAGE = 'Pick up to four stack tags.';

/** Trimmed text; `''` becomes `null` (clears the field), anything else must pass `inner`. */
function clearable(inner: z.ZodType<string, string>) {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(inner.nullable());
}

/** A credential-free http(s) URL of at most 2048 characters; one check, so one message (lesson 2026-11-14). */
export function isPublicWorkUrl(value: string): boolean {
  if (value.length > PUBLIC_WORK_URL_MAX || !URL.canParse(value)) {
    return false;
  }

  const url = new URL(value);

  return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '' && url.username === '' && url.password === '';
}

export const mentorProfileUpdateSchema = z.object({
  displayName: clearable(z.string().max(DISPLAY_NAME_MAX, DISPLAY_NAME_MESSAGE)).optional(),
  publicWorkUrl: clearable(z.string().refine(isPublicWorkUrl, PUBLIC_WORK_URL_MESSAGE)).optional(),
  bio: clearable(z.string().max(BIO_MAX, BIO_MESSAGE)).optional(),
  stackTags: z
    .array(StackTags.schema(STACK_TAG_MESSAGE))
    .max(MAX_STACK_TAGS, STACK_TAGS_MAX_MESSAGE)
    // Distinct, in vocabulary order.
    .transform((tags) => StackTags.normalize(tags))
    .optional(),
});

export type MentorProfileUpdateInput = z.output<typeof mentorProfileUpdateSchema>;
