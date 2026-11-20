import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { UserSchema } from '../auth/user.entity';
import { BookingSchema } from '../bookings/booking.entity';

export const SESSION_MESSAGE_MAX = 4000;
export const SESSION_MESSAGE_BODY_CHECK = `char_length(body) between 1 and ${SESSION_MESSAGE_MAX}`;

/**
 * One text message of a session (spec 2026-11-20-text-session; R01: sessions are text). Append-only.
 * `seq` is the polling cursor: an identity the database assigns; sends of one booking are serialized
 * by the booking row lock, so a reader that saw `seq = n` saw every committed message of it up to `n`.
 * `body` is free text about people: shown only to the session's two parties, never logged.
 */
export const SessionMessageSchema = defineEntity({
  name: 'SessionMessage',
  tableName: 'session_messages',
  checks: [{ name: 'session_messages_body_check', expression: SESSION_MESSAGE_BODY_CHECK }],
  indexes: [{ name: 'session_messages_booking_seq_idx', properties: ['booking', 'seq'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    seq: p.bigint('number').generated('identity'),
    booking: () => p.manyToOne(BookingSchema).ref().deleteRule('restrict'),
    author: () => p.manyToOne(UserSchema).ref().deleteRule('restrict'),
    body: p.text(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class SessionMessage extends SessionMessageSchema.class {}

SessionMessageSchema.setClass(SessionMessage);
