import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { Booking } from '../bookings/booking.entity';
import { entities } from '../index';
import {
  NOTE_APPROVED_UNIQUE,
  NOTE_DECISIONS,
  NOTE_VERSION_UNIQUE,
  NOTE_WAITING_UNIQUE,
  SessionNoteVersion,
  SessionNoteVersionSchema,
} from './session-note-version.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }));
const meta = orm.getMetadata().get(SessionNoteVersion);

afterAll(async () => {
  await orm.close();
});

describe('SessionNoteVersion entity', () => {
  it('maps to session_note_versions with nullable decision columns', () => {
    expect(entities).toContain(SessionNoteVersionSchema);
    expect(meta.tableName).toBe('session_note_versions');
    expect(NOTE_DECISIONS).toEqual(['approved', 'declined']);
    expect(meta.properties.version.columnTypes[0]).toBe('smallint');
    expect(meta.properties.decision.nullable).toBe(true);
    expect(meta.properties.decisionComment.nullable).toBe(true);
    expect(meta.properties.decidedAt.nullable).toBe(true);
    expect(meta.properties.booking.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties.booking.targetMeta?.class).toBe(Booking);
    expect(meta.properties.booking.deleteRule).toBe('restrict');
  });

  it('keeps one waiting and one approved version per session, and closes every decision hole with CHECKs', () => {
    expect(meta.uniques).toEqual([
      { name: NOTE_VERSION_UNIQUE, properties: ['booking', 'version'] },
      { name: NOTE_WAITING_UNIQUE, properties: ['booking'], where: 'decision is null' },
      { name: NOTE_APPROVED_UNIQUE, properties: ['booking'], where: "decision = 'approved'" },
    ]);
    expect(Object.fromEntries(meta.checks.map((check) => [check.name, check.expression]))).toEqual({
      session_note_versions_version_check: 'version between 1 and 10',
      session_note_versions_body_check: 'char_length(body) between 20 and 20000',
      session_note_versions_decision_check: "decision is null or decision in ('approved', 'declined')",
      session_note_versions_comment_check: "(decision is not distinct from 'declined') = (decision_comment is not null)",
      session_note_versions_comment_length_check: 'decision_comment is null or char_length(decision_comment) between 10 and 2000',
      session_note_versions_decided_check: '(decision is null) = (decided_at is null)',
    });
  });

  it('generates the id and the send time', () => {
    expect(meta.properties.id.onCreate?.({} as SessionNoteVersion, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta.properties.sentAt.onCreate?.({} as SessionNoteVersion, orm.em)).toBeInstanceOf(Date);
  });
});
