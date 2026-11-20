import { z } from 'zod';

// Session note routes (spec 2026-11-20-session-note). Bounds mirror the CHECKs on `session_note_versions`.

export const NOTE_MIN = 20;
export const NOTE_MAX = 20000;
export const NOTE_LENGTH_MESSAGE = `Write the note in ${NOTE_MIN} to ${NOTE_MAX} characters.`;
export const DECLINE_COMMENT_MESSAGE = 'Say what should change, in 10 to 2000 characters.';
const VERSION_MESSAGE = 'Pick the note version you are deciding on.';

/** `POST /api/sessions/[id]/note`: the mentor sends a version. */
export const sessionNoteSchema = z.object({
  body: z.string(NOTE_LENGTH_MESSAGE).trim().min(NOTE_MIN, NOTE_LENGTH_MESSAGE).max(NOTE_MAX, NOTE_LENGTH_MESSAGE),
});

const version = z.number(VERSION_MESSAGE).int(VERSION_MESSAGE).min(1, VERSION_MESSAGE);

/** `POST /api/sessions/[id]/note/decision`: the mentee approves the waiting version, or declines it with a comment. */
export const sessionNoteDecisionSchema = z.discriminatedUnion(
  'decision',
  [
    z.object({ decision: z.literal('approved'), version }),
    z.object({
      decision: z.literal('declined'),
      version,
      comment: z.string(DECLINE_COMMENT_MESSAGE).trim().min(10, DECLINE_COMMENT_MESSAGE).max(2000, DECLINE_COMMENT_MESSAGE),
    }),
  ],
  { error: 'Approve or decline the note.' },
);

export type SessionNoteInput = z.output<typeof sessionNoteSchema>;
export type SessionNoteDecisionInput = z.output<typeof sessionNoteDecisionSchema>;
