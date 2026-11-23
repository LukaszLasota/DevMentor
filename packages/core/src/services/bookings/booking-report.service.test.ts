import { randomUUID } from 'node:crypto';
import { Booking, BOOKING_REPORT_BOOKING_UNIQUE, BookingReport, MentorProfile, UniqueConstraintViolationException, User } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { ALREADY_REPORTED_MESSAGE, BookingReportService, NOT_REPORTABLE_MESSAGE, OWN_BOOKING_REPORT_MESSAGE, REPORT_NOT_FOUND_MESSAGE } from './booking-report.service';
import { BOOKING_NOT_FOUND_MESSAGE } from './booking.service';

const NOW = new Date('2026-06-22T16:00:00.000Z');
const MENTEE_ID = randomUUID();
const MESSAGE = 'The mentor did not show up for the session.';
const OPERATOR_ID = randomUUID();

function ref<T extends object>(entity: T) {
  return Object.assign(entity, { getEntity: () => entity });
}

function makeBooking(fields: Partial<Booking> = {}): Booking {
  return Object.assign(new Booking(), {
    id: randomUUID(),
    mentorProfile: ref(Object.assign(new MentorProfile(), { id: randomUUID(), displayName: 'Ada', user: ref(Object.assign(new User(), { id: randomUUID(), email: 'ada@devmentor.test' })) })),
    mentee: ref(Object.assign(new User(), { id: MENTEE_ID, email: 'mentee@devmentor.test' })),
    startsAt: NOW,
    status: 'confirmed',
    ...fields,
  });
}

function setup({ status = 'confirmed' as Booking['status'], operators = 'ops-a@devmentor.test,ops-b@devmentor.test', appUrl = 'https://app.test' as string | null } = {}) {
  const booking = makeBooking({ status });
  const reports: BookingReport[] = [];
  const em = {
    findOne: vi.fn(async (entity: unknown, where: { id?: string; mentee?: string; booking?: string }) => {
      if (entity === BookingReport) {
        return reports.find((report) => (where.id !== undefined ? report.id === where.id : report.booking.id === where.booking)) ?? null;
      }

      return where.id === booking.id && where.mentee === MENTEE_ID ? booking : null;
    }),
    find: vi.fn(async () => reports),
    nativeUpdate: vi.fn(async (_entity: unknown, where: { id: string }, data: Partial<BookingReport>) => {
      const report = reports.find((candidate) => candidate.id === where.id && candidate.resolvedAt == null);
      if (report) Object.assign(report, data);
      return report ? 1 : 0;
    }),
    clear: vi.fn(),
    create: vi.fn((_entity: unknown, data: { booking: string; message: string }) => {
      const report = Object.assign(new BookingReport(), { id: randomUUID(), booking: ref(booking), message: data.message, createdAt: NOW });
      reports.push(report);
      return report;
    }),
    transactional: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => callback(em)),
  };
  const logger = { error: vi.fn() };
  const events = { emit: vi.fn(async () => undefined) };
  const mailSender = { send: vi.fn<(message: { to: string; subject: string; text: string }) => Promise<void>>(async () => undefined) };
  const service = new BookingReportService({
    em: em as unknown as Cradle['em'],
    clock: { now: () => NOW },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', OPERATOR_EMAILS: operators, APP_URL: appUrl ?? '' }),
    logger: logger as unknown as Cradle['logger'],
    events: events as unknown as Cradle['events'],
    mailSender,
  });

  return { service, booking, reports, em, logger, events, mailSender };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('BookingReportService.report', () => {
  it('stores the mentee\'s report once, announces it and emails every operator without the message (AC3)', async () => {
    const { service, booking, reports, events, mailSender } = setup();

    await expect(service.report(MENTEE_ID, booking.id, { message: MESSAGE })).resolves.toEqual({ reportedAt: NOW.toISOString() });

    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toBe(MESSAGE);
    expect(booking.status).toBe('confirmed');
    expect(events.emit).toHaveBeenCalledWith('bookings.booking.reported', { bookingId: booking.id, reportId: reports[0]?.id });
    expect(mailSender.send.mock.calls.map(([mail]) => mail)).toEqual(
      ['ops-a@devmentor.test', 'ops-b@devmentor.test'].map((to) => ({
        to,
        subject: 'A mentee reported a booking',
        text: `A mentee reported a problem with booking ${booking.id}.\n\nhttps://app.test/admin`,
      })),
    );
    expect(JSON.stringify(mailSender.send.mock.calls)).not.toContain(MESSAGE);
  });

  it('accepts a cancelled booking too, and sends nothing without operators or APP_URL', async () => {
    const { service, booking, mailSender } = setup({ status: 'cancelled', operators: '' });

    await service.report(MENTEE_ID, booking.id, { message: MESSAGE });

    expect(mailSender.send).not.toHaveBeenCalled();

    const noUrl = setup({ appUrl: null, operators: 'ops@devmentor.test' });
    await noUrl.service.report(MENTEE_ID, noUrl.booking.id, { message: MESSAGE });
    expect(noUrl.mailSender.send.mock.calls[0]?.[0].text).toContain('\n\n/admin');
  });

  it('refuses a second report with ALREADY_REPORTED, also when it loses the race on the unique key', async () => {
    const { service, booking, em } = setup();
    await service.report(MENTEE_ID, booking.id, { message: MESSAGE });

    expect(await rejection(service.report(MENTEE_ID, booking.id, { message: MESSAGE }))).toMatchObject({
      status: 409,
      code: 'ALREADY_REPORTED',
      message: ALREADY_REPORTED_MESSAGE,
    });

    const raced = setup();
    raced.em.transactional.mockRejectedValueOnce(
      new UniqueConstraintViolationException(Object.assign(new Error('duplicate key'), { constraint: BOOKING_REPORT_BOOKING_UNIQUE })),
    );
    expect(await rejection(raced.service.report(MENTEE_ID, raced.booking.id, { message: MESSAGE }))).toMatchObject({ code: 'ALREADY_REPORTED' });
    expect(em.create).toHaveBeenCalledTimes(1);
  });

  it('lets any other storage failure through', async () => {
    const { service, booking, em } = setup();
    em.transactional.mockRejectedValueOnce(new Error('db down'));

    await expect(service.report(MENTEE_ID, booking.id, { message: MESSAGE })).rejects.toThrow('db down');
  });

  it.each(['pending_payment', 'expired', 'failed', 'payment_orphaned'] as const)('refuses a %s booking with NOT_REPORTABLE', async (status) => {
    const { service, booking } = setup({ status });

    expect(await rejection(service.report(MENTEE_ID, booking.id, { message: MESSAGE }))).toMatchObject({
      status: 409,
      code: 'NOT_REPORTABLE',
      message: NOT_REPORTABLE_MESSAGE,
    });
  });

  it('answers 404 for another mentee\'s or an unknown booking', async () => {
    const { service, booking } = setup();

    expect(await rejection(service.report(randomUUID(), booking.id, { message: MESSAGE }))).toMatchObject({ status: 404, message: BOOKING_NOT_FOUND_MESSAGE });
  });

  it('keeps the report when an operator email fails', async () => {
    const { service, booking, reports, mailSender, logger } = setup();
    mailSender.send.mockRejectedValueOnce(new Error('smtp down'));

    await service.report(MENTEE_ID, booking.id, { message: MESSAGE });

    expect(reports).toHaveLength(1);
    expect(mailSender.send).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith({ booking: { id: booking.id }, err: expect.any(Error) }, 'Report email to an operator failed');
  });
});

describe('BookingReportService.list', () => {
  it('lists every report newest first with the booking, mentee and mentor', async () => {
    const { service, booking, em } = setup();
    await service.report(MENTEE_ID, booking.id, { message: MESSAGE });
    const unnamed = setup();
    (unnamed.booking.mentorProfile.getEntity() as MentorProfile).displayName = null;
    await unnamed.service.report(MENTEE_ID, unnamed.booking.id, { message: MESSAGE });

    await expect(service.list()).resolves.toEqual([
      {
        reportId: expect.any(String),
        bookingId: booking.id,
        bookingStatus: 'confirmed',
        message: MESSAGE,
        createdAt: NOW.toISOString(),
        resolvedAt: null,
        startsAt: NOW.toISOString(),
        menteeEmail: 'mentee@devmentor.test',
        mentorName: 'Ada',
      },
    ]);
    expect(em.find).toHaveBeenCalledWith(BookingReport, {}, { populate: ['booking.mentee', 'booking.mentorProfile.user'], orderBy: { createdAt: 'desc' } });
    // #87: the mentor's e-mail instead of a blank cell.
    await expect(unnamed.service.list()).resolves.toMatchObject([{ mentorName: 'ada@devmentor.test' }]);
  });
});

describe('BookingReportService.resolve', () => {
  it('marks a report resolved once and keeps its first time', async () => {
    const { service, booking, reports } = setup();
    await service.report(MENTEE_ID, booking.id, { message: MESSAGE });
    const id = reports[0]?.id as string;

    await expect(service.resolve(OPERATOR_ID, id)).resolves.toEqual({ resolvedAt: NOW.toISOString() });
    (reports[0] as BookingReport).resolvedAt = new Date('2026-06-20T00:00:00.000Z');
    await expect(service.resolve(OPERATOR_ID, id)).resolves.toEqual({ resolvedAt: '2026-06-20T00:00:00.000Z' });
  });

  it("refuses (403) an operator who is the booking's mentor and leaves the report open (threat model T-06)", async () => {
    const { service, booking, reports, em } = setup();
    await service.report(MENTEE_ID, booking.id, { message: MESSAGE });
    const id = reports[0]?.id as string;
    const mentorUserId = booking.mentorProfile.getEntity().user.id;

    await expect(service.resolve(mentorUserId, id)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN', message: OWN_BOOKING_REPORT_MESSAGE });
    expect(reports[0]?.resolvedAt ?? null).toBeNull();
    expect(em.nativeUpdate).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown report', async () => {
    const { service } = setup();

    await expect(service.resolve(OPERATOR_ID, randomUUID())).rejects.toMatchObject({ status: 404, message: REPORT_NOT_FOUND_MESSAGE });
  });
});

