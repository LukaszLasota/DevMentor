import { z } from 'zod';

// Session routes (spec 2026-11-20-text-session). Bounds mirror the CHECKs on `session_messages` and
// `session_answers`; the server decides who may write and when.

export const MESSAGE_MAX = 4000;
export const MESSAGE_LENGTH_MESSAGE = `Write a message of up to ${MESSAGE_MAX} characters.`;
export const ANSWER_MIN = 20;
export const ANSWER_MAX = 20000;
export const ANSWER_LENGTH_MESSAGE = `Write the answer in ${ANSWER_MIN} to ${ANSWER_MAX} characters.`;

/** `POST /api/sessions/[id]/messages`. */
export const sessionMessageSchema = z.object({
  body: z.string(MESSAGE_LENGTH_MESSAGE).trim().min(1, MESSAGE_LENGTH_MESSAGE).max(MESSAGE_MAX, MESSAGE_LENGTH_MESSAGE),
});

/** `POST /api/sessions/[id]/answer`. */
export const sessionAnswerSchema = z.object({
  body: z.string(ANSWER_LENGTH_MESSAGE).trim().min(ANSWER_MIN, ANSWER_LENGTH_MESSAGE).max(ANSWER_MAX, ANSWER_LENGTH_MESSAGE),
});

/** `GET /api/sessions/[id]?after=<seq>`: messages after this sequence number (all when absent). */
export const sessionReadQuerySchema = z.object({
  after: z.coerce.number('Pass a message sequence number.').int('Pass a message sequence number.').min(0, 'Pass a message sequence number.').optional(),
});

export type SessionMessageInput = z.output<typeof sessionMessageSchema>;
export type SessionAnswerInput = z.output<typeof sessionAnswerSchema>;
export type SessionReadQuery = z.output<typeof sessionReadQuerySchema>;
