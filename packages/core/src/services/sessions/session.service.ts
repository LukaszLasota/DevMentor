import { Booking, isUniqueViolation, SESSION_ANSWER_BOOKING_UNIQUE, SessionAnswer, SessionMessage } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { ConflictError, ForbiddenError, NotFoundError } from '../../http/errors';
import type { SessionAnswerInput, SessionMessageInput, SessionReadQuery } from '../../validators/sessions/session-message.schema';
import { lockForUpdate } from '../bookings/booking.service';

/** Messages can be sent from the start until this long after the end (a short wrap-up). */
export const MESSAGE_GRACE_MS = 30 * 60_000;
/** The written answer can be submitted from the start until this long after the end. */
export const ANSWER_GRACE_MS = 24 * 60 * 60_000;
/** Bounded storage per session without a rate limiter (spec Q8). */
export const MAX_MESSAGES = 500;

export const SESSION_NOT_FOUND_MESSAGE = 'Session not found.';
export const SESSION_NOT_OPEN_MESSAGE = 'The chat is not open now.';
export const SESSION_FULL_MESSAGE = 'This session has reached its message limit.';
export const ANSWER_NOT_OPEN_MESSAGE = 'The written answer cannot be submitted now.';
export const ALREADY_ANSWERED_MESSAGE = 'The written answer was already submitted.';
export const MENTOR_ONLY_MESSAGE = 'Only the mentor submits the written answer.';

export type SessionRole = 'mentee' | 'mentor';

export interface SessionMessageView {
  id: string;
  seq: number;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface SessionAnswerView {
  body: string;
  submittedAt: string;
}

/** `GET /api/sessions/[id]` and `/sessions/[id]`. */
export interface SessionView {
  id: string;
  role: SessionRole;
  lengthMinutes: number;
  startsAt: string;
  endsAt: string;
  messagesUntil: string;
  answerUntil: string;
  /** Where the chat is in time: before the start, open for messages, or closed (read-only). */
  phase: 'not_started' | 'open' | 'closed';
  canSend: boolean;
  canAnswer: boolean;
  otherParty: { displayName: string };
  messages: SessionMessageView[];
  answer: SessionAnswerView | null;
}

/** One row of "My sessions". */
export interface SessionListItem {
  id: string;
  role: SessionRole;
  otherParty: { displayName: string };
  lengthMinutes: number;
  startsAt: string;
  endsAt: string;
  state: 'upcoming' | 'open' | 'awaiting_answer' | 'answered';
}

const notFound = () => new NotFoundError(SESSION_NOT_FOUND_MESSAGE);

/** The one access rule (spec AC4): a confirmed booking whose mentee or whose mentor is `userId`. */
export function partyWhere(userId: string, bookingId?: string) {
  return {
    ...(bookingId === undefined ? {} : { id: bookingId }),
    status: 'confirmed' as const,
    $or: [{ mentee: userId }, { mentorProfile: { user: userId } }],
  };
}

/**
 * Text sessions in DevMentor (spec 2026-11-20-text-session; R01: text, no video). A session is a
 * confirmed booking; only its mentee and its mentor can open it (anyone else: 404, like an unknown
 * id). Messages go from the start to the end plus a short wrap-up; the mentor submits one written
 * answer until a day after the end. Message and answer bodies are shown only to the two parties and
 * never logged.
 */
export class SessionService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly env: Cradle['env'];
  private readonly logger: Cradle['logger'];
  private readonly events: Cradle['events'];
  private readonly mailSender: Cradle['mailSender'];

  constructor({ em, clock, env, logger, events, mailSender }: Pick<Cradle, 'em' | 'clock' | 'env' | 'logger' | 'events' | 'mailSender'>) {
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.logger = logger;
    this.events = events;
    this.mailSender = mailSender;
  }

  /** The session for one of its parties, with the messages after `after` (all when absent). */
  async get(userId: string, bookingId: string, { after }: SessionReadQuery = {}): Promise<SessionView> {
    const booking = await this.party(userId, bookingId);
    const messages = await this.em.find(
      SessionMessage,
      { booking: booking.id, seq: { $gt: after ?? 0 } },
      { orderBy: { seq: 'asc' }, limit: MAX_MESSAGES },
    );
    const answer = await this.em.findOne(SessionAnswer, { booking: booking.id });
    const role = roleOf(booking, userId);
    const windows = windowsOf(booking, this.clock.now());

    return {
      id: booking.id,
      role,
      lengthMinutes: booking.lengthMinutes,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      messagesUntil: windows.messagesUntil.toISOString(),
      answerUntil: windows.answerUntil.toISOString(),
      phase: windows.canSend ? 'open' : windows.started ? 'closed' : 'not_started',
      canSend: windows.canSend,
      canAnswer: role === 'mentor' && answer === null && windows.canAnswer,
      otherParty: otherPartyOf(booking, role),
      messages: messages.map((message) => messageView(message, userId)),
      answer: answer === null ? null : { body: answer.body, submittedAt: answer.submittedAt.toISOString() },
    };
  }

  /**
   * One message from a party while the chat is open. Sends of one session hold the booking row lock,
   * so they commit in `seq` order (a poll never skips one) and the message cap holds.
   */
  async send(userId: string, bookingId: string, { body }: SessionMessageInput): Promise<SessionMessageView> {
    const booking = await this.party(userId, bookingId);

    const message = await this.em.transactional(async (em) => {
      await em.findOne(Booking, { id: booking.id }, lockForUpdate());

      if (!windowsOf(booking, this.clock.now()).canSend) {
        throw new ConflictError(SESSION_NOT_OPEN_MESSAGE, { code: 'SESSION_NOT_OPEN' });
      }

      if ((await em.count(SessionMessage, { booking: booking.id })) >= MAX_MESSAGES) {
        throw new ConflictError(SESSION_FULL_MESSAGE, { code: 'SESSION_FULL' });
      }

      return em.create(SessionMessage, { booking: booking.id, author: userId, body });
    });

    return messageView(message, userId);
  }

  /** The mentor's one written answer (AC3); the mentee is emailed a link (never the body). */
  async answer(userId: string, bookingId: string, { body }: SessionAnswerInput): Promise<SessionAnswerView> {
    const booking = await this.party(userId, bookingId);

    if (roleOf(booking, userId) !== 'mentor') {
      throw new ForbiddenError(MENTOR_ONLY_MESSAGE);
    }

    if (!windowsOf(booking, this.clock.now()).canAnswer) {
      throw new ConflictError(ANSWER_NOT_OPEN_MESSAGE, { code: 'ANSWER_NOT_OPEN' });
    }

    const alreadyAnswered = () => new ConflictError(ALREADY_ANSWERED_MESSAGE, { code: 'ALREADY_ANSWERED' });

    if ((await this.em.findOne(SessionAnswer, { booking: booking.id })) !== null) {
      throw alreadyAnswered();
    }

    let answer: SessionAnswer;

    try {
      // Its own fork: a lost race (the unique key) poisons that unit of work only.
      answer = await this.em.transactional(async (em) => em.create(SessionAnswer, { booking: booking.id, author: userId, body }));
    } catch (error) {
      if (isUniqueViolation(error, SESSION_ANSWER_BOOKING_UNIQUE)) {
        throw alreadyAnswered();
      }

      throw error;
    }

    await this.events.emit('sessions.answer.submitted', { bookingId: booking.id, answerId: answer.id });
    await this.tellMentee(booking);

    return { body: answer.body, submittedAt: answer.submittedAt.toISOString() };
  }

  /** "My sessions": the caller's confirmed bookings as mentee or as mentor, by start time. */
  async listMine(userId: string): Promise<SessionListItem[]> {
    const bookings = await this.em.find(Booking, partyWhere(userId), { populate: ['mentorProfile', 'mentee'], orderBy: { startsAt: 'asc' } });
    const answers = await this.em.find(SessionAnswer, { booking: { $in: bookings.map((booking) => booking.id) } });
    const answered = new Set(answers.map((answer) => answer.booking.id));
    const now = this.clock.now();

    return bookings.map((booking) => {
      const role = roleOf(booking, userId);
      const windows = windowsOf(booking, now);
      const state = answered.has(booking.id)
        ? 'answered'
        : now.getTime() < booking.startsAt.getTime()
          ? 'upcoming'
          : windows.canSend
            ? 'open'
            : 'awaiting_answer';

      return {
        id: booking.id,
        role,
        otherParty: otherPartyOf(booking, role),
        lengthMinutes: booking.lengthMinutes,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        state,
      };
    });
  }

  private async party(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.em.findOne(Booking, partyWhere(userId, bookingId), { populate: ['mentorProfile', 'mentee'] });

    if (booking === null) {
      throw notFound();
    }

    return booking;
  }

  private async tellMentee(booking: Booking): Promise<void> {
    const mentor = booking.mentorProfile.getEntity().displayName ?? 'Your mentor';

    try {
      await this.mailSender.send({
        to: booking.mentee.getEntity().email,
        subject: `${mentor} sent your written answer`,
        text: [`${mentor} submitted the written answer to your session.`, `${this.env.APP_URL ?? ''}/sessions/${booking.id}`].join('\n\n'),
      });
    } catch (error) {
      this.logger.error({ booking: { id: booking.id }, err: error }, 'Written answer email failed');
    }
  }
}

function roleOf(booking: Booking, userId: string): SessionRole {
  return booking.mentee.id === userId ? 'mentee' : 'mentor';
}

function otherPartyOf(booking: Booking, role: SessionRole): { displayName: string } {
  return role === 'mentee'
    ? { displayName: booking.mentorProfile.getEntity().displayName ?? 'Your mentor' }
    : { displayName: booking.mentee.getEntity().githubLogin ?? 'Your mentee' };
}

function windowsOf(booking: Booking, now: Date) {
  const messagesUntil = new Date(booking.endsAt.getTime() + MESSAGE_GRACE_MS);
  const answerUntil = new Date(booking.endsAt.getTime() + ANSWER_GRACE_MS);
  const started = now.getTime() >= booking.startsAt.getTime();

  return {
    messagesUntil,
    answerUntil,
    started,
    canSend: started && now.getTime() < messagesUntil.getTime(),
    canAnswer: started && now.getTime() < answerUntil.getTime(),
  };
}

function messageView(message: SessionMessage, userId: string): SessionMessageView {
  return { id: message.id, seq: message.seq, mine: message.author.id === userId, body: message.body, createdAt: message.createdAt.toISOString() };
}
