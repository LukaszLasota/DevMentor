import { randomUUID } from 'node:crypto';
import {
  Booking,
  LockMode,
  MentorProfile,
  NOTE_APPROVED_UNIQUE,
  NOTE_WAITING_UNIQUE,
  SessionAnswer,
  SessionNoteVersion,
  UniqueConstraintViolationException,
  User,
} from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import {
  MENTEE_DECIDES_MESSAGE,
  MENTOR_SENDS_MESSAGE,
  NOTE_APPROVED_MESSAGE,
  NOTE_LIMIT_MESSAGE,
  NOTE_NOT_OPEN_MESSAGE,
  NOTE_NOT_PENDING_MESSAGE,
  NOTE_PENDING_MESSAGE,
  SessionNoteService,
} from './session-note.service';

const START = new Date('2026-06-22T16:00:00.000Z');
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);
const LOCK = { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true };
const NOTE = 'We set up retries behind a queue and made the handler idempotent.';
const NOTE_2 = 'Version two: also covered dead-letter handling and alerting.';
const COMMENT = 'Please add the dead-letter part.';

function ref<T extends object>(entity: T) {
  return Object.assign(entity, { getEntity: () => entity });
}

const MENTEE = ref(Object.assign(new User(), { id: randomUUID(), email: 'mentee@devmentor.test' }));
const MENTOR = ref(Object.assign(new User(), { id: randomUUID(), email: 'ada@devmentor.test' }));
const STRANGER = randomUUID();

type Where = Record<string, unknown>;

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

    return value === expected;
  });
}

function setup({ now = at(30), answer = NOTE as string | null, appUrl = 'https://app.test' as string | null } = {}) {
  const profile = ref(Object.assign(new MentorProfile(), { id: randomUUID(), user: MENTOR, displayName: 'Ada' }));
  const booking = Object.assign(new Booking(), { id: randomUUID(), mentorProfile: profile, mentee: MENTEE, startsAt: START, endsAt: at(25), status: 'confirmed' });
  const versions: SessionNoteVersion[] = [];
  const answers = answer === null ? [] : [Object.assign(new SessionAnswer(), { id: randomUUID(), booking, body: answer })];
  const table = (entity: unknown): object[] => (entity === Booking ? [booking] : entity === SessionNoteVersion ? versions : answers);
  const em = {
    findOne: vi.fn(async (entity: unknown, where: Where) => table(entity).find((row) => matches(row, where)) ?? null),
    find: vi.fn(async (entity: unknown, where: Where) => table(entity).filter((row) => matches(row, where))),
    create: vi.fn((_entity: unknown, data: { version: number; body: string }) => {
      const version = Object.assign(new SessionNoteVersion(), { id: randomUUID(), booking, version: data.version, body: data.body, sentAt: now, decision: null });
      versions.push(version);
      return version;
    }),
    clear: vi.fn(),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => callback(em)),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const events = { emit: vi.fn(async () => undefined) };
  const mailSender = { send: vi.fn<(mail: { to: string; subject: string; text: string }) => Promise<void>>(async () => undefined) };
  const service = new SessionNoteService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => now },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', APP_URL: appUrl ?? '' }),
    logger: logger as unknown as Cradle['logger'],
    events: events as unknown as Cradle['events'],
    mailSender,
  });

  return { service, booking, versions, em, logger, events, mailSender };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('SessionNoteService.get', () => {
  it('lets the mentor start from the written answer once the session has ended', async () => {
    const { service, booking } = setup();

    await expect(service.get(MENTOR.id, booking.id)).resolves.toEqual({ role: 'mentor', state: 'none', versions: [], canSend: true, canDecide: false, prefill: NOTE });
    await expect(service.get(MENTEE.id, booking.id)).resolves.toEqual({ role: 'mentee', state: 'none', versions: [], canSend: false, canDecide: false, prefill: null });
  });

  it('starts empty without a written answer, and closed before the end', async () => {
    const noAnswer = setup({ answer: null });
    await expect(noAnswer.service.get(MENTOR.id, noAnswer.booking.id)).resolves.toMatchObject({ canSend: true, prefill: '' });

    const early = setup({ now: at(24) });
    await expect(early.service.get(MENTOR.id, early.booking.id)).resolves.toMatchObject({ canSend: false, prefill: null });
  });

  it('answers 404 to anyone but the two parties', async () => {
    const { service, booking } = setup();

    expect(await rejection(service.get(STRANGER, booking.id))).toMatchObject({ status: 404 });
  });
});

describe('SessionNoteService: send, decline, redraft, approve (AC1, AC2)', () => {
  it('runs the whole cycle with locks, emails (links only) and events', async () => {
    const { service, booking, em, events, mailSender, logger } = setup();

    const sent = await service.send(MENTOR.id, booking.id, { body: NOTE });
    expect(sent).toMatchObject({ state: 'waiting', canSend: false, prefill: null, versions: [{ version: 1, body: NOTE, decision: null, decisionComment: null, decidedAt: null }] });
    expect(em.findOne).toHaveBeenCalledWith(Booking, { id: booking.id }, LOCK);
    expect(events.emit).toHaveBeenCalledWith('sessions.note.sent', { bookingId: booking.id, version: 1 });
    expect(mailSender.send).toHaveBeenLastCalledWith({
      to: 'mentee@devmentor.test',
      subject: 'Your session note is ready for review',
      text: `Your mentor sent the session note. Approve it, or decline it with a comment.\n\nhttps://app.test/sessions/${booking.id}`,
    });
    await expect(service.get(MENTEE.id, booking.id)).resolves.toMatchObject({ canDecide: true });

    const declined = await service.decide(MENTEE.id, booking.id, { decision: 'declined', version: 1, comment: COMMENT });
    expect(declined).toMatchObject({ state: 'declined', canDecide: false, versions: [{ decision: 'declined', decisionComment: COMMENT, decidedAt: at(30).toISOString() }] });
    expect(events.emit).toHaveBeenCalledWith('sessions.note.declined', { bookingId: booking.id, version: 1, declineCount: 1 });
    expect(mailSender.send).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'ada@devmentor.test', subject: 'The mentee declined your session note' }));
    expect(logger.warn).not.toHaveBeenCalled();
    await expect(service.get(MENTOR.id, booking.id)).resolves.toMatchObject({ canSend: true, prefill: NOTE });

    await service.send(MENTOR.id, booking.id, { body: NOTE_2 });
    await service.decide(MENTEE.id, booking.id, { decision: 'declined', version: 2, comment: COMMENT });
    expect(logger.warn).toHaveBeenCalledWith({ booking: { id: booking.id }, note: { declineCount: 2 } }, expect.stringMatching(/R15/));

    await service.send(MENTOR.id, booking.id, { body: NOTE_2 });
    const approved = await service.decide(MENTEE.id, booking.id, { decision: 'approved', version: 3 });
    expect(approved).toMatchObject({ state: 'approved', canDecide: false });
    expect(approved.versions.map((version) => version.decision)).toEqual(['declined', 'declined', 'approved']);
    expect(events.emit).toHaveBeenCalledWith('sessions.note.approved', { bookingId: booking.id, version: 3 });
    expect(mailSender.send).toHaveBeenLastCalledWith(expect.objectContaining({ subject: 'The mentee approved your session note' }));
    expect(JSON.stringify(mailSender.send.mock.calls)).not.toContain(NOTE);
    await expect(service.get(MENTOR.id, booking.id)).resolves.toMatchObject({ canSend: false });
  });

  it('a repeated decision is a no-op; a different one on a decided version is refused', async () => {
    const { service, booking, events } = setup();
    await service.send(MENTOR.id, booking.id, { body: NOTE });
    await service.decide(MENTEE.id, booking.id, { decision: 'approved', version: 1 });
    events.emit.mockClear();

    await expect(service.decide(MENTEE.id, booking.id, { decision: 'approved', version: 1 })).resolves.toMatchObject({ state: 'approved' });
    expect(events.emit).not.toHaveBeenCalled();
    expect(await rejection(service.decide(MENTEE.id, booking.id, { decision: 'declined', version: 1, comment: COMMENT }))).toMatchObject({
      status: 409,
      code: 'NOTE_NOT_PENDING',
      message: NOTE_NOT_PENDING_MESSAGE,
    });
    expect(await rejection(service.decide(MENTEE.id, booking.id, { decision: 'approved', version: 7 }))).toMatchObject({ code: 'NOTE_NOT_PENDING' });
  });
});

describe('SessionNoteService refusals', () => {
  it('only the mentor sends and only the mentee decides; strangers get 404 (AC4)', async () => {
    const { service, booking } = setup();

    expect(await rejection(service.send(MENTEE.id, booking.id, { body: NOTE }))).toMatchObject({ status: 403, message: MENTOR_SENDS_MESSAGE });
    expect(await rejection(service.decide(MENTOR.id, booking.id, { decision: 'approved', version: 1 }))).toMatchObject({ status: 403, message: MENTEE_DECIDES_MESSAGE });
    expect(await rejection(service.send(STRANGER, booking.id, { body: NOTE }))).toMatchObject({ status: 404 });
    expect(await rejection(service.decide(STRANGER, booking.id, { decision: 'approved', version: 1 }))).toMatchObject({ status: 404 });
  });

  it('refuses before the end, while a version waits, after approval and at the limit', async () => {
    const early = setup({ now: at(24) });
    expect(await rejection(early.service.send(MENTOR.id, early.booking.id, { body: NOTE }))).toMatchObject({ code: 'NOTE_NOT_OPEN', message: NOTE_NOT_OPEN_MESSAGE });

    const { service, booking, versions } = setup();
    await service.send(MENTOR.id, booking.id, { body: NOTE });
    expect(await rejection(service.send(MENTOR.id, booking.id, { body: NOTE }))).toMatchObject({ code: 'NOTE_PENDING', message: NOTE_PENDING_MESSAGE });

    await service.decide(MENTEE.id, booking.id, { decision: 'approved', version: 1 });
    expect(await rejection(service.send(MENTOR.id, booking.id, { body: NOTE }))).toMatchObject({ code: 'NOTE_APPROVED', message: NOTE_APPROVED_MESSAGE });

    const full = setup();
    for (let n = 1; n <= 10; n += 1) {
      full.versions.push(Object.assign(new SessionNoteVersion(), { booking: full.booking, version: n, body: NOTE, sentAt: at(30), decision: 'declined', decisionComment: COMMENT, decidedAt: at(30) }));
    }
    expect(await rejection(full.service.send(MENTOR.id, full.booking.id, { body: NOTE }))).toMatchObject({ code: 'NOTE_LIMIT', message: NOTE_LIMIT_MESSAGE });
    await expect(full.service.get(MENTOR.id, full.booking.id)).resolves.toMatchObject({ state: 'declined', canSend: false, prefill: null });
    expect(versions).toHaveLength(1);
  });

  it('maps lost races on the unique indexes to 409s and lets other failures through', async () => {
    const violation = (constraint: string) => new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint }));

    const waiting = setup();
    waiting.em.transactional.mockRejectedValueOnce(violation(NOTE_WAITING_UNIQUE));
    expect(await rejection(waiting.service.send(MENTOR.id, waiting.booking.id, { body: NOTE }))).toMatchObject({ code: 'NOTE_PENDING' });

    const approvedRace = setup();
    approvedRace.em.transactional.mockRejectedValueOnce(violation(NOTE_APPROVED_UNIQUE));
    expect(await rejection(approvedRace.service.send(MENTOR.id, approvedRace.booking.id, { body: NOTE }))).toMatchObject({ code: 'NOTE_APPROVED' });

    const down = setup();
    down.em.transactional.mockRejectedValueOnce(new Error('db down'));
    await expect(down.service.send(MENTOR.id, down.booking.id, { body: NOTE })).rejects.toThrow('db down');
  });

  it('keeps the step when an email fails, and links without APP_URL', async () => {
    const { service, booking, mailSender, logger } = setup({ appUrl: null });
    mailSender.send.mockRejectedValueOnce(new Error('smtp down'));

    await expect(service.send(MENTOR.id, booking.id, { body: NOTE })).resolves.toMatchObject({ state: 'waiting' });
    expect(mailSender.send.mock.calls[0]?.[0].text).toContain(`\n\n/sessions/${booking.id}`);
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, err: expect.any(Error) }, 'Session note email failed');
  });
});
