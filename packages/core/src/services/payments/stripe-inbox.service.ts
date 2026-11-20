import { LockMode, StripeEvent } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { ServiceUnavailableError, ValidationError } from '../../http/errors';
import { stripeWebhookEventSchema, type StripeWebhookEvent } from './stripe-event-handlers';
import { verifyStripeSignature } from './webhook-signature';

export const WEBHOOK_NOT_CONFIGURED_MESSAGE = 'Stripe webhooks are not configured.';
export const WEBHOOK_SIGNATURE_MESSAGE = 'Invalid Stripe signature.';
export const WEBHOOK_PAYLOAD_MESSAGE = 'Invalid Stripe event.';

/** Longest `last_error` kept on the row: enough to diagnose, never a payload dump. */
export const LAST_ERROR_MAX_LENGTH = 500;

/** Stores a verified event once; a redelivery of the same id inserts nothing. */
export const INSERT_STRIPE_EVENT_SQL = `insert into stripe_events (id, type, payload, received_at, attempts)
values (?, ?, ?::jsonb, ?::timestamptz, 0)
on conflict (id) do nothing`;

/** Records a failed attempt outside the rolled-back transaction. Params: last_error, id. */
export const RECORD_STRIPE_EVENT_FAILURE_SQL = `update stripe_events set attempts = attempts + 1, last_error = ?
where id = ? and processed_at is null`;

export type InboxOutcome = 'processed' | 'duplicate';

/** `Name: message`, single line, capped — the handler's own words, never the event payload. */
function redactError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';

  return text.replace(/\s+/g, ' ').slice(0, LAST_ERROR_MAX_LENGTH);
}

/**
 * The durable Stripe webhook inbox (spec 2026-11-20-booking-stripe-checkout): verify the signature
 * over the exact bytes → store the event if absent → in one transaction lock its row, re-check
 * `processed_at` and dispatch to the handler registered for its type, so concurrent deliveries
 * dispatch once. A handler failure rolls back its writes, records the attempt and rethrows (the
 * route answers 500 and Stripe redelivers). Unknown types are stored and marked processed.
 */
export class StripeInboxService {
  private readonly em: Cradle['em'];
  private readonly env: Cradle['env'];
  private readonly clock: Cradle['clock'];
  private readonly logger: Cradle['logger'];
  private readonly stripeEventHandlers: Cradle['stripeEventHandlers'];

  constructor({ em, env, clock, logger, stripeEventHandlers }: Pick<Cradle, 'em' | 'env' | 'clock' | 'logger' | 'stripeEventHandlers'>) {
    this.em = em;
    this.env = env;
    this.clock = clock;
    this.logger = logger;
    this.stripeEventHandlers = stripeEventHandlers;
  }

  async receive(rawBody: string, signatureHeader: string | null): Promise<InboxOutcome> {
    const event = this.verify(rawBody, signatureHeader);
    const log = { stripeEvent: { id: event.id, type: event.type } };

    await this.em.execute(INSERT_STRIPE_EVENT_SQL, [event.id, event.type, rawBody, this.clock.now().toISOString()]);

    try {
      const outcome = await this.dispatch(event);
      this.logger.info({ ...log, outcome }, 'Stripe event received');

      return outcome;
    } catch (error) {
      await this.em.execute(RECORD_STRIPE_EVENT_FAILURE_SQL, [redactError(error), event.id]);
      this.logger.error({ ...log, err: error }, 'Stripe event processing failed; Stripe will redeliver');

      throw error;
    }
  }

  private verify(rawBody: string, signatureHeader: string | null): StripeWebhookEvent {
    const secret = this.env.STRIPE_WEBHOOK_SECRET;

    if (secret === undefined) {
      this.logger.warn('Stripe webhook refused: STRIPE_WEBHOOK_SECRET is missing');
      throw new ServiceUnavailableError(WEBHOOK_NOT_CONFIGURED_MESSAGE);
    }

    const check = verifyStripeSignature(rawBody, signatureHeader, secret, this.clock.now());

    if (!check.ok) {
      this.logger.warn({ signature: check.reason }, 'Stripe webhook refused: bad signature');
      throw new ValidationError(WEBHOOK_SIGNATURE_MESSAGE);
    }

    let json: unknown;

    try {
      json = JSON.parse(rawBody);
    } catch {
      json = undefined;
    }

    const parsed = stripeWebhookEventSchema.safeParse(json);

    if (!parsed.success) {
      this.logger.warn('Stripe webhook refused: signed body is not a Stripe event');
      throw new ValidationError(WEBHOOK_PAYLOAD_MESSAGE);
    }

    return parsed.data;
  }

  private dispatch(event: StripeWebhookEvent): Promise<InboxOutcome> {
    // Its own fork: a failed handler poisons that unit of work only.
    return this.em.transactional(async (em) => {
      const row = await em.findOne(StripeEvent, { id: event.id }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });

      if (row === null || row.processedAt != null) {
        return 'duplicate';
      }

      await this.stripeEventHandlers.get(event.type)?.(event, em);
      row.attempts += 1;
      row.processedAt = this.clock.now();
      row.lastError = null;

      return 'processed';
    });
  }
}
