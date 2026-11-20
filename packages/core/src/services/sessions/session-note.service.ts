import {
  Booking,
  isUniqueViolation,
  NOTE_APPROVED_UNIQUE,
  NOTE_MAX_VERSIONS,
  NOTE_VERSION_UNIQUE,
  NOTE_WAITING_UNIQUE,
  type NoteDecision,
  SessionAnswer,
  SessionNoteVersion,
} from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { ConflictError, ForbiddenError, NotFoundError } from '../../http/errors';
import type { SessionNoteDecisionInput, SessionNoteInput } from '../../validators/sessions/session-note.schema';
import { lockForUpdate } from '../bookings/booking.service';
import { partyWhere, SESSION_NOT_FOUND_MESSAGE, type SessionRole } from './session.service';

export const MENTOR_SENDS_MESSAGE = 'Only the mentor writes the note.';
export const MENTEE_DECIDES_MESSAGE = 'Only the mentee approves or declines the note.';
export const NOTE_NOT_OPEN_MESSAGE = 'You can write the note when the session has ended.';
export const NOTE_PENDING_MESSAGE = 'The mentee has not decided on the last version yet.';
export const NOTE_APPROVED_MESSAGE = 'The note is already approved.';
// A literal, not built from `NOTE_MAX_VERSIONS`: module scope must not read db values (entry tests mock db).
export const NOTE_LIMIT_MESSAGE = 'A note can have at most 10 versions.';
export const NOTE_NOT_PENDING_MESSAGE = 'This version is not waiting for a decision.';

export type NoteState = 'none' | 'waiting' | 'declined' | 'approved';

export interface NoteVersionView {
  version: number;
  body: string;
  sentAt: string;
  decision: NoteDecision | null;
  decisionComment: string | null;
  decidedAt: string | null;
}

/** `GET /api/sessions/[id]/note` and the "Session note" section of `/sessions/[id]`. */
export interface NoteView {
  role: SessionRole;
  state: NoteState;
  versions: NoteVersionView[];
  canSend: boolean;
  canDecide: boolean;
  /** What the mentor's form starts from: the declined text, else the written answer; `null` when it cannot send. */
  prefill: string | null;
}

const conflict = (message: string, code: string) => new ConflictError(message, { code });
const pending = () => conflict(NOTE_PENDING_MESSAGE, 'NOTE_PENDING');
const approved = () => conflict(NOTE_APPROVED_MESSAGE, 'NOTE_APPROVED');
const notPending = () => conflict(NOTE_NOT_PENDING_MESSAGE, 'NOTE_NOT_PENDING');

function stateOf(versions: SessionNoteVersion[]): NoteState {
  const latest = versions.at(-1);

  return latest === undefined ? 'none' : latest.decision === null || latest.decision === undefined ? 'waiting' : latest.decision;
}

/**
 * Session notes (spec 2026-11-20-session-note; R15, R03): after a session ends the mentor sends a
 * version, the mentee approves it or declines it with a comment, the mentor sends the next one; no
 * co-editing. Only the session's two parties see it; nothing is published. Each step reads the
 * versions after locking the booking row, and the database keeps one waiting and one approved
 * version, so concurrent tabs end in a 409, never a second waiting version.
 */
export class SessionNoteService {
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

  async get(userId: string, bookingId: string): Promise<NoteView> {
    const booking = await this.party(userId, bookingId);
    const versions = await this.em.find(SessionNoteVersion, { booking: booking.id }, { orderBy: { version: 'asc' } });
    const role: SessionRole = booking.mentee.id === userId ? 'mentee' : 'mentor';
    const state = stateOf(versions);
    const ended = this.clock.now().getTime() >= booking.endsAt.getTime();
    const canSend = role === 'mentor' && ended && (state === 'none' || state === 'declined') && versions.length < NOTE_MAX_VERSIONS;
    const answer = canSend && state === 'none' ? await this.em.findOne(SessionAnswer, { booking: booking.id }) : null;

    return {
      role,
      state,
      versions: versions.map((version) => ({
        version: version.version,
        body: version.body,
        sentAt: version.sentAt.toISOString(),
        decision: version.decision ?? null,
        decisionComment: version.decisionComment ?? null,
        decidedAt: version.decidedAt?.toISOString() ?? null,
      })),
      canSend,
      canDecide: role === 'mentee' && state === 'waiting',
      prefill: !canSend ? null : state === 'declined' ? (versions.at(-1) as SessionNoteVersion).body : (answer?.body ?? ''),
    };
  }

  /** The mentor sends the next version (AC1, AC2). */
  async send(userId: string, bookingId: string, { body }: SessionNoteInput): Promise<NoteView> {
    const booking = await this.party(userId, bookingId);

    if (booking.mentee.id === userId) {
      throw new ForbiddenError(MENTOR_SENDS_MESSAGE);
    }

    let version: number;

    try {
      version = await this.em.transactional(async (em) => {
        await em.findOne(Booking, { id: booking.id }, lockForUpdate());

        if (this.clock.now().getTime() < booking.endsAt.getTime()) {
          throw conflict(NOTE_NOT_OPEN_MESSAGE, 'NOTE_NOT_OPEN');
        }

        // Read after the lock, inside this fork: a second tab waits here and then sees the first one's version.
        const versions = await em.find(SessionNoteVersion, { booking: booking.id }, { orderBy: { version: 'asc' } });
        const state = stateOf(versions);

        if (state === 'waiting') {
          throw pending();
        }

        if (state === 'approved') {
          throw approved();
        }

        if (versions.length >= NOTE_MAX_VERSIONS) {
          throw conflict(NOTE_LIMIT_MESSAGE, 'NOTE_LIMIT');
        }

        em.create(SessionNoteVersion, { booking: booking.id, version: versions.length + 1, body });

        return versions.length + 1;
      });
    } catch (error) {
      if (isUniqueViolation(error, NOTE_WAITING_UNIQUE) || isUniqueViolation(error, NOTE_VERSION_UNIQUE)) {
        throw pending();
      }

      if (isUniqueViolation(error, NOTE_APPROVED_UNIQUE)) {
        throw approved();
      }

      throw error;
    }

    this.em.clear();
    await this.events.emit('sessions.note.sent', { bookingId: booking.id, version });
    await this.mail(booking.mentee.getEntity().email, 'Your session note is ready for review', 'Your mentor sent the session note. Approve it, or decline it with a comment.', booking.id);

    return this.get(userId, bookingId);
  }

  /**
   * The mentee decides the waiting version (AC1, AC2). A repeat of the decision already recorded on
   * that version (a double click) changes nothing and answers the note.
   */
  async decide(userId: string, bookingId: string, input: SessionNoteDecisionInput): Promise<NoteView> {
    const booking = await this.party(userId, bookingId);

    if (booking.mentee.id !== userId) {
      throw new ForbiddenError(MENTEE_DECIDES_MESSAGE);
    }

    const outcome = await this.em.transactional(async (em) => {
      await em.findOne(Booking, { id: booking.id }, lockForUpdate());
      const version = await em.findOne(SessionNoteVersion, { booking: booking.id, version: input.version });

      if (version === null) {
        throw notPending();
      }

      if (version.decision !== null && version.decision !== undefined) {
        if (version.decision === input.decision) {
          return { repeat: true, declineCount: 0 };
        }

        throw notPending();
      }

      version.decision = input.decision;
      version.decisionComment = input.decision === 'declined' ? input.comment : null;
      version.decidedAt = this.clock.now();

      // Every version before the waiting one was declined (a new one is sent only after a decline), so
      // declining version n is the n-th decline in a row (R15).
      return { repeat: false, declineCount: input.decision === 'declined' ? input.version : 0 };
    });

    this.em.clear();

    if (!outcome.repeat) {
      if (input.decision === 'declined') {
        await this.events.emit('sessions.note.declined', { bookingId: booking.id, version: input.version, declineCount: outcome.declineCount });

        if (outcome.declineCount >= 2) {
          // R15's review trigger: the founders look at notes declined twice in a row (R16).
          this.logger.warn({ booking: { id: booking.id }, note: { declineCount: outcome.declineCount } }, 'Session note declined twice in a row — founder review (R15)');
        }
      } else {
        await this.events.emit('sessions.note.approved', { bookingId: booking.id, version: input.version });
      }

      const mentor = booking.mentorProfile.getEntity().user.getEntity();
      const subject = input.decision === 'approved' ? 'The mentee approved your session note' : 'The mentee declined your session note';
      const text = input.decision === 'approved' ? 'The mentee approved the session note.' : 'The mentee declined the session note with a comment. Read it and send a new version.';
      await this.mail(mentor.email, subject, text, booking.id);
    }

    return this.get(userId, bookingId);
  }

  private async party(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.em.findOne(Booking, partyWhere(userId, bookingId), { populate: ['mentorProfile.user', 'mentee'] });

    if (booking === null) {
      throw new NotFoundError(SESSION_NOT_FOUND_MESSAGE);
    }

    return booking;
  }

  /** A link to the session, never the note's text; best effort. */
  private async mail(to: string, subject: string, line: string, bookingId: string): Promise<void> {
    try {
      await this.mailSender.send({ to, subject, text: [line, `${this.env.APP_URL ?? ''}/sessions/${bookingId}`].join('\n\n') });
    } catch (error) {
      this.logger.error({ booking: { id: bookingId }, err: error }, 'Session note email failed');
    }
  }
}
