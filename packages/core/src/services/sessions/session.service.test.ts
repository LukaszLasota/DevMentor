import { randomUUID } from 'node:crypto';
import { Booking, LockMode, MentorProfile, SESSION_ANSWER_BOOKING_UNIQUE, SessionAnswer, SessionMessage, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import {
  ALREADY_ANSWERED_MESSAGE,
  ANSWER_NOT_OPEN_MESSAGE,
  MAX_MESSAGES,
  MENTOR_ONLY_MESSAGE,
  partyWhere,
  SESSION_FULL_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
  SESSION_NOT_OPEN_MESSAGE,
  SessionService,
} from './session.service';

const START = new Date('2026-06-22T16:00:00.000Z');
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };

function ref<T extends object>(entity: T) {
  return Object.assign(entity, { getEntity: () => entity });
}

const MENTEE = ref(Object.assign(new User(), { id: randomUUID(), email: 'mentee@devmentor.test', githubLogin: 'mia' }));
const MENTOR = ref(Object.assign(new User(), { id: randomUUID(), email: 'ada@devmentor.test' }));
const STRANGER = randomUUID();

type Where = Record<string, unknown>;

/** Equality on scalars and on references by id, `$or`, `$gt` on numbers, `$in`, and `mentorProfile.user`. */
function matches(row: object, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === '$or') {
      return (expected as Where[]).some((branch) => matches(row, branch));
    }

    const actual = (row as Where)[key];

    if (key === 'mentorProfile' && typeof expected === 'object') {
      return ((actual as MentorProfile).user as unknown as { id: string }).id === (expected as { user: string }).user;
    }

    const value = actual !== null && typeof actual === 'object' && 'id' in actual ? (actual as { id: string }).id : actual;

    if (expected !== null && typeof expected === 'object') {
      const range = expected as { $gt?: number; $in?: string[] };
      return range.$in !== undefined ? range.$in.includes(value as string) : (value as number) > (range.$gt as number);
    }

    return value === expected;
  });
}

function makeBooking(fields: Partial<Booking> = {}): Booking {
  const profile = ref(Object.assign(new MentorProfile(), { id: randomUUID(), user: MENTOR, displayName: 'Ada' }));

  return Object.assign(new Booking(), {
    id: randomUUID(),
    mentorProfile: profile,
    mentee: MENTEE,
    startsAt: START,
    endsAt: at(25),
    lengthMinutes: 25,
    status: 'confirmed',
    ...fields,
  });
}

function setup({ now = at(5), bookings = [makeBooking()], appUrl = 'https://app.test' as string | null } = {}) {
  const messages: SessionMessage[] = [];
  const answers: SessionAnswer[] = [];
  let seq = 0;
  const table = (entity: unknown): object[] => (entity === Booking ? bookings : entity === SessionMessage ? messages : answers);
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Where) => table(entity).find((row) => matches(row, where)) ?? null),
    find: vi.fn(async (entity: unknown, where: Where, options?: { limit?: number }) =>
      table(entity)
        .filter((row) => matches(row, where))
        .slice(0, options?.limit),
    ),
    count: vi.fn(async (entity: unknown, where: Where) => table(entity).filter((row) => matches(row, where)).length),
    create: vi.fn((entity: unknown, data: { booking: string; author: string; body: string }) => {
      const booking = bookings.find((row) => row.id === data.booking) as Booking;
      const author = { id: data.author };

      if (entity === SessionMessage) {
        seq += 1;
        const message = Object.assign(new SessionMessage(), { id: randomUUID(), seq, booking, author, body: data.body, createdAt: now });
        messages.push(message);
        return message;
      }

      const answer = Object.assign(new SessionAnswer(), { id: randomUUID(), booking, author, body: data.body, submittedAt: now });
      answers.push(answer);
      return answer;
    }),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => callback(em)),
  };
  const logger = { error: vi.fn() };
  const events = { emit: vi.fn(async () => undefined) };
  const mailSender = { send: vi.fn<(mail: { to: string; subject: string; text: string }) => Promise<void>>(async () => undefined) };
  const service = new SessionService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => now },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', APP_URL: appUrl ?? '' }),
    logger: logger as unknown as Cradle['logger'],
    events: events as unknown as Cradle['events'],
    mailSender,
  });

  return { service, booking: bookings[0] as Booking, bookings, messages, answers, em, logger, events, mailSender };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

const ANSWER = 'Use a queue for the retries and keep the handler idempotent.';

describe('partyWhere', () => {
  it('is one predicate: a confirmed booking whose mentee or mentor is the user', () => {
    expect(partyWhere('u', 'b')).toEqual({ id: 'b', status: 'confirmed', $or: [{ mentee: 'u' }, { mentorProfile: { user: 'u' } }] });
    expect(partyWhere('u')).toEqual({ status: 'confirmed', $or: [{ mentee: 'u' }, { mentorProfile: { user: 'u' } }] });
  });
});

describe('SessionService.get', () => {
  it('shows the mentee their session with its windows and the mentor as the other party', async () => {
    const { service, booking } = setup();

    await expect(service.get(MENTEE.id, booking.id)).resolves.toEqual({
      id: booking.id,
      role: 'mentee',
      lengthMinutes: 25,
      startsAt: START.toISOString(),
      endsAt: at(25).toISOString(),
      messagesUntil: at(55).toISOString(),
      answerUntil: at(25 + 24 * 60).toISOString(),
      phase: 'open',
      canSend: true,
      canAnswer: false,
      otherParty: { displayName: 'Ada' },
      messages: [],
      answer: null,
    });
  });

  it('shows the mentor the mentee by GitHub login, and fallbacks without names', async () => {
    const { service, booking } = setup();
    await expect(service.get(MENTOR.id, booking.id)).resolves.toMatchObject({ role: 'mentor', canAnswer: true, otherParty: { displayName: 'mia' } });

    const anonymous = makeBooking({ mentee: ref(Object.assign(new User(), { id: MENTEE.id, email: 'x@devmentor.test', githubLogin: null })) as unknown as Booking['mentee'] });
    (anonymous.mentorProfile.getEntity() as MentorProfile).displayName = null;
    const other = setup({ bookings: [anonymous] });
    await expect(other.service.get(MENTOR.id, anonymous.id)).resolves.toMatchObject({ otherParty: { displayName: 'Your mentee' } });
    await expect(other.service.get(MENTEE.id, anonymous.id)).resolves.toMatchObject({ otherParty: { displayName: 'Your mentor' } });
  });

  it('answers 404 to anyone but the two parties, and for a booking that is not confirmed (AC4)', async () => {
    const { service, booking } = setup({ bookings: [makeBooking(), makeBooking({ status: 'cancelled' })] });

    expect(await rejection(service.get(STRANGER, booking.id))).toMatchObject({ status: 404, message: SESSION_NOT_FOUND_MESSAGE });
    expect(await rejection(service.get(MENTEE.id, randomUUID()))).toMatchObject({ status: 404 });

    const cancelled = setup({ bookings: [makeBooking({ status: 'cancelled' })] });
    expect(await rejection(cancelled.service.get(MENTEE.id, cancelled.booking.id))).toMatchObject({ status: 404 });
  });

  it('a mentor who is also a mentee elsewhere is the mentor here and the mentee there', async () => {
    const theirOwn = makeBooking({ mentee: MENTOR as unknown as Booking['mentee'] });
    const { service, booking } = setup({ bookings: [makeBooking(), theirOwn] });

    await expect(service.get(MENTOR.id, booking.id)).resolves.toMatchObject({ role: 'mentor' });
    await expect(service.get(MENTOR.id, theirOwn.id)).resolves.toMatchObject({ role: 'mentee' });
  });

  it('returns the messages after the cursor, marking the caller\'s own, and the answer', async () => {
    const { service, booking, em } = setup();
    await service.send(MENTEE.id, booking.id, { body: 'Hi' });
    await service.send(MENTOR.id, booking.id, { body: 'Hello' });

    const all = await service.get(MENTEE.id, booking.id);
    expect(all.messages.map(({ seq, mine, body }) => [seq, mine, body])).toEqual([
      [1, true, 'Hi'],
      [2, false, 'Hello'],
    ]);
    expect((await service.get(MENTEE.id, booking.id, { after: 1 })).messages.map((message) => message.body)).toEqual(['Hello']);
    expect(em.find).toHaveBeenCalledWith(SessionMessage, { booking: booking.id, seq: { $gt: 1 } }, { orderBy: { seq: 'asc' }, limit: MAX_MESSAGES });

    await service.answer(MENTOR.id, booking.id, { body: ANSWER });
    await expect(service.get(MENTOR.id, booking.id)).resolves.toMatchObject({ canAnswer: false, answer: { body: ANSWER, submittedAt: at(5).toISOString() } });
  });

  it.each([
    ['before the start', -1, 'not_started', false, false],
    ['at the start', 0, 'open', true, true],
    ['in the wrap-up', 54, 'open', true, true],
    ['after the wrap-up', 55, 'closed', false, true],
    ['a day after the end', 25 + 24 * 60, 'closed', false, false],
  ])('%s: phase %s, can send %s, can answer %s', async (_case, minutes, phase, canSend, canAnswer) => {
    const { service, booking } = setup({ now: at(minutes) });

    await expect(service.get(MENTOR.id, booking.id)).resolves.toMatchObject({ phase, canSend, canAnswer });
  });
});

describe('SessionService.send', () => {
  it('stores a message under the booking row lock and returns it as the caller\'s own', async () => {
    const { service, booking, em, messages } = setup();

    const sent = await service.send(MENTOR.id, booking.id, { body: 'Hello' });

    expect(sent).toEqual({
      id: messages[0]?.id,
      seq: 1,
      mine: true,
      body: 'Hello',
      createdAt: at(5).toISOString(),
    });
    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id }, LOCK);
    expect(em.create).toHaveBeenCalledWith(SessionMessage, { booking: booking.id, author: MENTOR.id, body: 'Hello' });
  });

  it.each([-1, 55])('refuses outside the window (%i min) with SESSION_NOT_OPEN', async (minutes) => {
    const { service, booking, messages } = setup({ now: at(minutes) });

    expect(await rejection(service.send(MENTEE.id, booking.id, { body: 'Hi' }))).toMatchObject({
      status: 409,
      code: 'SESSION_NOT_OPEN',
      message: SESSION_NOT_OPEN_MESSAGE,
    });
    expect(messages).toHaveLength(0);
  });

  it('refuses the message after the cap with SESSION_FULL, and a stranger with 404', async () => {
    const { service, booking, em } = setup();
    em.count.mockResolvedValueOnce(MAX_MESSAGES);

    expect(await rejection(service.send(MENTEE.id, booking.id, { body: 'Hi' }))).toMatchObject({ code: 'SESSION_FULL', message: SESSION_FULL_MESSAGE });
    expect(await rejection(service.send(STRANGER, booking.id, { body: 'Hi' }))).toMatchObject({ status: 404 });
  });
});

describe('SessionService.answer', () => {
  it('stores the mentor\'s answer once, announces it and emails the mentee a link only (AC3)', async () => {
    const { service, booking, events, mailSender, answers } = setup();

    await expect(service.answer(MENTOR.id, booking.id, { body: ANSWER })).resolves.toEqual({ body: ANSWER, submittedAt: at(5).toISOString() });

    expect(events.emit).toHaveBeenCalledWith('sessions.answer.submitted', { bookingId: booking.id, answerId: answers[0]?.id });
    expect(mailSender.send).toHaveBeenCalledWith({
      to: 'mentee@devmentor.test',
      subject: 'Ada sent your written answer',
      text: `Ada submitted the written answer to your session.\n\nhttps://app.test/sessions/${booking.id}`,
    });
    expect(JSON.stringify(mailSender.send.mock.calls)).not.toContain(ANSWER);
  });

  it('refuses the mentee (403), a closed window, a second answer, and a stranger (404)', async () => {
    const { service, booking } = setup();

    expect(await rejection(service.answer(MENTEE.id, booking.id, { body: ANSWER }))).toMatchObject({ status: 403, message: MENTOR_ONLY_MESSAGE });
    expect(await rejection(service.answer(STRANGER, booking.id, { body: ANSWER }))).toMatchObject({ status: 404 });

    await service.answer(MENTOR.id, booking.id, { body: ANSWER });
    expect(await rejection(service.answer(MENTOR.id, booking.id, { body: ANSWER }))).toMatchObject({
      status: 409,
      code: 'ALREADY_ANSWERED',
      message: ALREADY_ANSWERED_MESSAGE,
    });

    const early = setup({ now: at(-1) });
    expect(await rejection(early.service.answer(MENTOR.id, early.booking.id, { body: ANSWER }))).toMatchObject({
      code: 'ANSWER_NOT_OPEN',
      message: ANSWER_NOT_OPEN_MESSAGE,
    });
  });

  it('maps a lost race on the unique key to ALREADY_ANSWERED and lets other failures through', async () => {
    const raced = setup();
    raced.em.transactional.mockRejectedValueOnce(
      new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint: SESSION_ANSWER_BOOKING_UNIQUE })),
    );
    expect(await rejection(raced.service.answer(MENTOR.id, raced.booking.id, { body: ANSWER }))).toMatchObject({ code: 'ALREADY_ANSWERED' });

    const down = setup();
    down.em.transactional.mockRejectedValueOnce(new Error('db down'));
    await expect(down.service.answer(MENTOR.id, down.booking.id, { body: ANSWER })).rejects.toThrow('db down');
  });

  it('keeps the answer when the email fails, and links without APP_URL or a mentor name', async () => {
    const { service, booking, mailSender, logger } = setup({ appUrl: null });
    (booking.mentorProfile.getEntity() as MentorProfile).displayName = null;
    mailSender.send.mockRejectedValueOnce(new Error('smtp down'));

    await service.answer(MENTOR.id, booking.id, { body: ANSWER });

    expect(mailSender.send.mock.calls[0]?.[0]).toMatchObject({ subject: 'Your mentor sent your written answer', text: expect.stringContaining(`\n\n/sessions/${booking.id}`) });
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, err: expect.any(Error) }, 'Written answer email failed');
  });
});

describe('SessionService.listMine', () => {
  it('lists both roles\' confirmed sessions with their state', async () => {
    const upcoming = makeBooking({ startsAt: at(60), endsAt: at(85) });
    const open = makeBooking();
    const waiting = makeBooking({ startsAt: at(-120), endsAt: at(-95), mentee: MENTOR as unknown as Booking['mentee'] });
    const answered = makeBooking({ startsAt: at(-300), endsAt: at(-275) });
    const { service, em } = setup({ bookings: [upcoming, open, waiting, answered] });
    await service.answer(MENTOR.id, answered.id, { body: ANSWER }).catch(() => undefined);
    // The answer window of `answered` closed long ago in this clock; store it directly.
    await em.transactional(async () => em.create(SessionAnswer, { booking: answered.id, author: MENTOR.id, body: ANSWER }));

    const list = await service.listMine(MENTOR.id);

    expect(list.map(({ id, role, state }) => [id, role, state])).toEqual([
      [upcoming.id, 'mentor', 'upcoming'],
      [open.id, 'mentor', 'open'],
      [waiting.id, 'mentee', 'awaiting_answer'],
      [answered.id, 'mentor', 'answered'],
    ]);
    expect(list[0]).toEqual({
      id: upcoming.id,
      role: 'mentor',
      otherParty: { displayName: 'mia' },
      lengthMinutes: 25,
      startsAt: at(60).toISOString(),
      endsAt: at(85).toISOString(),
      state: 'upcoming',
    });
    expect(em.find).toHaveBeenCalledWith(Booking, partyWhere(MENTOR.id), { populate: ['mentorProfile', 'mentee'], orderBy: { startsAt: 'asc' } });
  });
});
