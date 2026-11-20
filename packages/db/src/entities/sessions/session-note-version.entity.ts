import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { BookingSchema } from '../bookings/booking.entity';

export const NOTE_DECISIONS = ['approved', 'declined'] as const;
export type NoteDecision = (typeof NOTE_DECISIONS)[number];

export const NOTE_MAX_VERSIONS = 10;

export const NOTE_VERSION_CHECK = `version between 1 and ${NOTE_MAX_VERSIONS}`;
export const NOTE_BODY_CHECK = 'char_length(body) between 20 and 20000';
export const NOTE_DECISION_CHECK = "decision is null or decision in ('approved', 'declined')";
export const NOTE_COMMENT_CHECK = "(decision is not distinct from 'declined') = (decision_comment is not null)";
export const NOTE_COMMENT_LENGTH_CHECK = 'decision_comment is null or char_length(decision_comment) between 10 and 2000';
export const NOTE_DECIDED_CHECK = '(decision is null) = (decided_at is null)';

/** Named so `SessionNoteService` maps each lost race (and only those) to its 409. */
export const NOTE_VERSION_UNIQUE = 'session_note_versions_booking_version_uq';
export const NOTE_WAITING_UNIQUE = 'session_note_versions_waiting_uq';
export const NOTE_APPROVED_UNIQUE = 'session_note_versions_approved_uq';

/**
 * One version of a session note (spec 2026-11-20-session-note; R15): the mentor sends it, the mentee
 * approves it or declines it with a comment, once. The database keeps at most one waiting and one
 * approved version per session. Shown only to the session's two parties; published nowhere (R03).
 */
export const SessionNoteVersionSchema = defineEntity({
  name: 'SessionNoteVersion',
  tableName: 'session_note_versions',
  checks: [
    { name: 'session_note_versions_version_check', expression: NOTE_VERSION_CHECK },
    { name: 'session_note_versions_body_check', expression: NOTE_BODY_CHECK },
    { name: 'session_note_versions_decision_check', expression: NOTE_DECISION_CHECK },
    { name: 'session_note_versions_comment_check', expression: NOTE_COMMENT_CHECK },
    { name: 'session_note_versions_comment_length_check', expression: NOTE_COMMENT_LENGTH_CHECK },
    { name: 'session_note_versions_decided_check', expression: NOTE_DECIDED_CHECK },
  ],
  uniques: [
    { name: NOTE_VERSION_UNIQUE, properties: ['booking', 'version'] },
    { name: NOTE_WAITING_UNIQUE, properties: ['booking'], where: 'decision is null' },
    { name: NOTE_APPROVED_UNIQUE, properties: ['booking'], where: "decision = 'approved'" },
  ],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    booking: () => p.manyToOne(BookingSchema).ref().deleteRule('restrict'),
    version: p.smallint(),
    body: p.text(),
    sentAt: p.datetime().onCreate(() => new Date()),
    decision: p.string().$type<NoteDecision>().columnType('text').nullable(),
    decisionComment: p.text().nullable(),
    decidedAt: p.datetime().nullable(),
  },
});

export class SessionNoteVersion extends SessionNoteVersionSchema.class {}

SessionNoteVersionSchema.setClass(SessionNoteVersion);
