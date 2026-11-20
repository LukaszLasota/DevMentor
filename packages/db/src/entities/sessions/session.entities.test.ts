import { MikroORM, ReferenceKind } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import { createConfig } from '../../config';
import { User } from '../auth/user.entity';
import { Booking } from '../bookings/booking.entity';
import { entities } from '../index';
import {
  SESSION_ANSWER_BODY_CHECK,
  SESSION_ANSWER_BOOKING_UNIQUE,
  SessionAnswer,
  SessionAnswerSchema,
} from './session-answer.entity';
import { SESSION_MESSAGE_BODY_CHECK, SessionMessage, SessionMessageSchema } from './session-message.entity';

// Metadata discovery only; the constructor does not open a connection.
const orm = new MikroORM(createConfig({ clientUrl: 'postgres://u:p@localhost:5432/db', pool: { min: 0, max: 1 }, debug: false }));
const messages = orm.getMetadata().get(SessionMessage);
const answers = orm.getMetadata().get(SessionAnswer);

afterAll(async () => {
  await orm.close();
});

describe('SessionMessage entity', () => {
  it('maps to session_messages with a database-assigned seq cursor and a bounded body', () => {
    expect(entities).toContain(SessionMessageSchema);
    expect(messages.tableName).toBe('session_messages');
    expect(messages.properties.seq.columnTypes[0]).toBe('bigint');
    expect(messages.properties.seq.generated).toBe('identity');
    expect(messages.properties.body.columnTypes[0]).toBe('text');
    expect(messages.checks).toEqual([{ name: 'session_messages_body_check', expression: SESSION_MESSAGE_BODY_CHECK }]);
    expect(SESSION_MESSAGE_BODY_CHECK).toBe('char_length(body) between 1 and 4000');
    expect(messages.indexes).toEqual([{ name: 'session_messages_booking_seq_idx', properties: ['booking', 'seq'] }]);
  });

  it.each([
    ['booking', Booking, 'booking_id'],
    ['author', User, 'author_id'],
  ] as const)('references %s through a restricting key', (name, target, field) => {
    const prop = messages.properties[name];

    expect(prop.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(prop.targetMeta?.class).toBe(target);
    expect(prop.fieldNames).toEqual([field]);
    expect(prop.deleteRule).toBe('restrict');
  });

  it('generates the id and the creation time', () => {
    expect(messages.properties.id.onCreate?.({} as SessionMessage, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect(messages.properties.createdAt.onCreate?.({} as SessionMessage, orm.em)).toBeInstanceOf(Date);
  });
});

describe('SessionAnswer entity', () => {
  it('maps to session_answers, one per booking, with a bounded body', () => {
    expect(entities).toContain(SessionAnswerSchema);
    expect(answers.tableName).toBe('session_answers');
    expect(answers.checks).toEqual([{ name: 'session_answers_body_check', expression: SESSION_ANSWER_BODY_CHECK }]);
    expect(SESSION_ANSWER_BODY_CHECK).toBe('char_length(body) between 20 and 20000');
    expect(answers.properties.booking.kind).toBe(ReferenceKind.ONE_TO_ONE);
    expect(answers.properties.booking.targetMeta?.class).toBe(Booking);
    expect(answers.properties.booking.unique).toBe(true);
    expect(answers.properties.booking.deleteRule).toBe('restrict');
    expect(answers.properties.author.targetMeta?.class).toBe(User);
    // MikroORM's default name for the column's unique constraint (the migration creates it by that name).
    expect(SESSION_ANSWER_BOOKING_UNIQUE).toBe('session_answers_booking_id_unique');
  });

  it('generates the id and the submission time', () => {
    expect(answers.properties.id.onCreate?.({} as SessionAnswer, orm.em)).toMatch(/^[0-9a-f-]{36}$/);
    expect(answers.properties.submittedAt.onCreate?.({} as SessionAnswer, orm.em)).toBeInstanceOf(Date);
  });
});
