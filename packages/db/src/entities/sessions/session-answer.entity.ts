import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';
import { BookingSchema } from '../bookings/booking.entity';

export const SESSION_ANSWER_MIN = 20;
export const SESSION_ANSWER_MAX = 20000;
export const SESSION_ANSWER_BODY_CHECK = `char_length(body) between ${SESSION_ANSWER_MIN} and ${SESSION_ANSWER_MAX}`;

/** Named so `SessionService` maps a second answer on one session (and only that) to 409. */
export const SESSION_ANSWER_BOOKING_UNIQUE = 'session_answers_booking_id_unique';

/**
 * The mentor's written answer to a session (spec 2026-11-20-text-session, AC3): one per booking,
 * submitted once, never edited (the note of #32 is drafted from it). Shown only to the two parties.
 */
export const SessionAnswerSchema = defineEntity({
  name: 'SessionAnswer',
  tableName: 'session_answers',
  checks: [{ name: 'session_answers_body_check', expression: SESSION_ANSWER_BODY_CHECK }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    booking: () => p.oneToOne(BookingSchema).owner().ref().deleteRule('restrict'),
    author: () => p.manyToOne(UserSchema).ref().deleteRule('restrict'),
    body: p.text(),
    submittedAt: p.datetime().onCreate(() => new Date()),
  },
});

export class SessionAnswer extends SessionAnswerSchema.class {}

SessionAnswerSchema.setClass(SessionAnswer);
