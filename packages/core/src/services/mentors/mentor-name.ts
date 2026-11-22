/** What a mentee sees when the mentor has no display name (unpublished and cleared): never a blank. */
export const MENTOR_NAME_FALLBACK = 'Your mentor';

/** The mentor's display name for a mentee, or {@link MENTOR_NAME_FALLBACK} when it is missing or blank (#85). */
export function mentorNameForMentee(displayName: string | null | undefined): string {
  return displayName != null && displayName.trim() !== '' ? displayName : MENTOR_NAME_FALLBACK;
}
