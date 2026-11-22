/** What a mentee sees when the mentor has no display name (unpublished and cleared): never a blank. */
export const MENTOR_NAME_FALLBACK = 'Your mentor';

const present = (name: string | null | undefined): name is string => name != null && name.trim() !== '';

/** The mentor's display name for a mentee, or {@link MENTOR_NAME_FALLBACK} when it is missing or blank (#85). */
export function mentorNameForMentee(displayName: string | null | undefined): string {
  return present(displayName) ? displayName : MENTOR_NAME_FALLBACK;
}

/** The same inside a sentence of mentee e-mail copy ("session with your mentor") (#87). */
export function mentorNameInSentence(displayName: string | null | undefined): string {
  return present(displayName) ? displayName : MENTOR_NAME_FALLBACK.toLowerCase();
}

/** For operator lists: the display name, or the mentor's e-mail so the row is still actionable (#87). */
export function mentorNameForOperator(displayName: string | null | undefined, email: string): string {
  return present(displayName) ? displayName : email;
}
