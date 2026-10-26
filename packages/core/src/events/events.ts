import type { Logger } from '../logger';

/**
 * Every in-process domain event and its payload. Ids follow `concept.entity.action` (AGENTS.md);
 * adding an event is one entry here.
 */
export interface DomainEvents {
  /** A user's stored roles changed (e.g. operator reconciliation, granted mentor role). */
  'auth.user.roles_changed': { userId: string; roles: readonly string[] };
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
