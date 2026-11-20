import type { Role } from '@devmentor/db';
import type { Logger } from '../logger';

/**
 * Every in-process domain event and its payload. Ids follow `concept.entity.action` (AGENTS.md);
 * adding an event is one entry here.
 */
export interface DomainEvents {
  /** A user's stored roles changed (e.g. operator reconciliation, granted mentor role). */
  'auth.user.roles_changed': { userId: string; roles: readonly Role[] };
  /**
   * A mentor invitation was accepted (the supply signal reporting will count). Emitted after the
   * acceptance transaction commits, never inside it; `publishDueAt` is the invitation's publish-by date.
   */
  'invitations.invitation.accepted': { invitationId: string; userId: string; publishDueAt: Date };
  /**
   * A mentor page became public: the first publish or a republish after unpublishing. Emitted after
   * the publish transaction commits, only by the call that set `published_at`.
   */
  'mentors.profile.published': { mentorProfileId: string; slug: string };
  /**
   * A mentor published a slot (the D13 supply signal). Emitted after the publish transaction
   * commits; `startsAt` is the UTC instant.
   */
  'availability.slot.published': { mentorProfileId: string; slotId: string; startsAt: Date };
  /**
   * A mentee's payment confirmed a booking (spec 2026-11-20-booking-stripe-checkout). Emitted after
   * the webhook transaction commits; `leadMinutes` is the R09 booking-to-start measurement.
   */
  'bookings.booking.confirmed': { bookingId: string; mentorProfileId: string; menteeId: string; startsAt: Date; leadMinutes: number };
  /**
   * A mentee cancelled a confirmed booking (spec 2026-11-20-booking-cancellation). Emitted after the
   * cancellation commits; `refundDue` = cancelled more than 24 hours ahead (R10).
   */
  'bookings.booking.cancelled': { bookingId: string; mentorProfileId: string; menteeId: string; startsAt: Date; refundDue: boolean };
  /** A mentee reported a dispute about a booking (R10: the operator decides, by hand). Emitted after the insert commits. */
  'bookings.booking.reported': { bookingId: string; reportId: string };
}

export type DomainEventName = keyof DomainEvents;
export type DomainEventListener<E extends DomainEventName> = (payload: DomainEvents[E]) => void | Promise<void>;

// Storage type only; `on`/`emit` keep listeners and payloads paired by event name.
type StoredListener = (payload: never) => void | Promise<void>;

/**
 * Typed in-process event emitter (container singleton `events`). No queue or worker: `emit` runs
 * the listeners one after another and resolves when all have finished. A failing listener is
 * logged and does not stop the others or the emitting operation.
 */
export class EventBus {
  private readonly logger: Logger;
  private readonly listeners = new Map<DomainEventName, Set<StoredListener>>();

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  /** Subscribes `listener`; returns a function that unsubscribes it. */
  on<E extends DomainEventName>(event: E, listener: DomainEventListener<E>): () => void {
    const listeners = this.listeners.get(event) ?? new Set<StoredListener>();
    this.listeners.set(event, listeners);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  async emit<E extends DomainEventName>(event: E, payload: DomainEvents[E]): Promise<void> {
    const listeners = [...(this.listeners.get(event) ?? [])] as DomainEventListener<E>[];

    for (const listener of listeners) {
      try {
        await listener(payload);
      } catch (error) {
        this.logger.error({ err: error, event }, 'Domain event listener failed');
      }
    }
  }
}
