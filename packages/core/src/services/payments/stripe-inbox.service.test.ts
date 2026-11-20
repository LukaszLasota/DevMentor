import { LockMode, StripeEvent } from '@devmentor/db';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { ServiceUnavailableError, ValidationError } from '../../http/errors';
import { createStripeEventHandlers, type StripeEventHandler } from './stripe-event-handlers';
import {
  INSERT_STRIPE_EVENT_SQL,
  LAST_ERROR_MAX_LENGTH,
  RECORD_STRIPE_EVENT_FAILURE_SQL,
  StripeInboxService,
  WEBHOOK_NOT_CONFIGURED_MESSAGE,
  WEBHOOK_PAYLOAD_MESSAGE,
  WEBHOOK_SIGNATURE_MESSAGE,
} from './stripe-inbox.service';
import { signStripePayload } from './webhook-signature';

const SECRET = 'whsec_test_secret';
const NOW = new Date('2026-11-20T12:00:00.000Z');
const T = Math.floor(NOW.getTime() / 1000);
const EVENT = {
  id: 'evt_1',
  object: 'event',
  type: 'checkout.session.completed',
  created: T,
  data: { object: { id: 'cs_1', client_reference_id: 'booking-1' } },
};
const BODY = JSON.stringify(EVENT);

interface Row {
  id: string;
  attempts: number;
  processedAt: Date | null;
  lastError: string | null;
}

function setup({
  row = { id: 'evt_1', attempts: 0, processedAt: null, lastError: null } as Row | null,
  handlers = new Map<string, StripeEventHandler>(),
  secret = SECRET as string | null,
} = {}) {
  const env = parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', STRIPE_WEBHOOK_SECRET: secret ?? '' });
  const txEm = { findOne: vi.fn(async () => row) };
  const em = {
    execute: vi.fn(async () => []),
    transactional: vi.fn(async (fn: (tx: typeof txEm) => Promise<unknown>) => fn(txEm)),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new StripeInboxService({
    em: em as unknown as Cradle['em'],
    env,
    clock: { now: () => NOW },
    logger: logger as unknown as Cradle['logger'],
    stripeEventHandlers: handlers,
  });

  return { service, em, txEm, logger, row };
}

const signed = (body: string, t = T) => signStripePayload(body, SECRET, t);

describe('createStripeEventHandlers', () => {
  it('starts empty: phase 1 registers no handler', () => {
    expect(createStripeEventHandlers().size).toBe(0);
  });
});

describe('StripeInboxService.receive', () => {
  it('stores the event, locks its row, dispatches the handler in the transaction and marks it processed', async () => {
    const handler = vi.fn<StripeEventHandler>(async () => undefined);
    const { service, em, txEm, row, logger } = setup({ handlers: new Map([['checkout.session.completed', handler]]) });

    await expect(service.receive(BODY, signed(BODY))).resolves.toBe('processed');

    expect(em.execute).toHaveBeenCalledWith(INSERT_STRIPE_EVENT_SQL, ['evt_1', 'checkout.session.completed', BODY, NOW.toISOString()]);
    expect(txEm.findOne).toHaveBeenCalledWith(StripeEvent, { id: 'evt_1' }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_1', data: EVENT.data, object: 'event' }), txEm);
    expect(row).toEqual({ id: 'evt_1', attempts: 1, processedAt: NOW, lastError: null });
    expect(logger.info).toHaveBeenCalledWith(
      { stripeEvent: { id: 'evt_1', type: 'checkout.session.completed' }, outcome: 'processed' },
      'Stripe event received',
    );
  });

  it('marks an event without a handler processed (ignored)', async () => {
    const { service, row } = setup();

    await expect(service.receive(BODY, signed(BODY))).resolves.toBe('processed');
    expect(row).toMatchObject({ attempts: 1, processedAt: NOW });
  });

  it('does not dispatch an event that is already processed (redelivery or a concurrent delivery)', async () => {
    const handler = vi.fn<StripeEventHandler>();
    const done = { id: 'evt_1', attempts: 1, processedAt: new Date('2026-11-20T11:00:00Z'), lastError: null };
    const { service } = setup({ row: done, handlers: new Map([['checkout.session.completed', handler]]) });

    await expect(service.receive(BODY, signed(BODY))).resolves.toBe('duplicate');
    expect(handler).not.toHaveBeenCalled();
    expect(done.attempts).toBe(1);
  });

  it('treats a missing row as a duplicate', async () => {
    const { service } = setup({ row: null });

    await expect(service.receive(BODY, signed(BODY))).resolves.toBe('duplicate');
  });

  it('records a failed attempt with a redacted, capped error and rethrows', async () => {
    const failure = new Error(`booking\nnot found ${'x'.repeat(LAST_ERROR_MAX_LENGTH)}`);
    const { service, em, row, logger } = setup({
      handlers: new Map([['checkout.session.completed', vi.fn<StripeEventHandler>(async () => Promise.reject(failure))]]),
    });

    await expect(service.receive(BODY, signed(BODY))).rejects.toBe(failure);

    const [sql, params] = em.execute.mock.calls[1] as unknown as [string, [string, string]];
    expect(sql).toBe(RECORD_STRIPE_EVENT_FAILURE_SQL);
    expect(params[1]).toBe('evt_1');
    expect(params[0]).toMatch(/^Error: booking not found x+$/);
    expect(params[0]).toHaveLength(LAST_ERROR_MAX_LENGTH);
    expect(row).toMatchObject({ attempts: 0, processedAt: null });
    expect(logger.error).toHaveBeenCalledWith(
      { stripeEvent: { id: 'evt_1', type: 'checkout.session.completed' }, err: failure },
      expect.stringContaining('redeliver'),
    );
  });

  it('rethrows the handler error and logs both when recording the attempt fails too', async () => {
    const failure = new Error('handler failed');
    const dbDown = new Error('db down');
    const { service, em, logger } = setup({
      handlers: new Map([['checkout.session.completed', vi.fn<StripeEventHandler>(async () => Promise.reject(failure))]]),
    });
    em.execute.mockResolvedValueOnce([]).mockRejectedValueOnce(dbDown);

    await expect(service.receive(BODY, signed(BODY))).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: failure }), expect.any(String));
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: dbDown }), 'Could not record the failed Stripe event attempt');
  });

  it('records a non-Error failure as unknown', async () => {
    const { service, em } = setup({
      handlers: new Map([['checkout.session.completed', vi.fn<StripeEventHandler>(async () => Promise.reject('nope'))]]),
    });

    await expect(service.receive(BODY, signed(BODY))).rejects.toBe('nope');
    expect(em.execute.mock.calls[1]).toEqual([RECORD_STRIPE_EVENT_FAILURE_SQL, ['Unknown error', 'evt_1']]);
  });

  it('answers 503 without a webhook secret and stores nothing', async () => {
    const { service, em } = setup({ secret: null });

    const error = await service.receive(BODY, signed(BODY)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({ message: WEBHOOK_NOT_CONFIGURED_MESSAGE });
    expect(em.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing header', null],
    ['a stale signature', signed(BODY, T - 301)],
    ['another body', signed(BODY.replace('cs_1', 'cs_2'))],
  ])('refuses %s with 400 and stores nothing', async (_name, header) => {
    const { service, em, logger } = setup();

    const error = await service.receive(BODY, header).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ message: WEBHOOK_SIGNATURE_MESSAGE });
    expect(em.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('cs_1');
  });

  it.each([
    ['not JSON', 'not json'],
    ['not a Stripe event', JSON.stringify({ id: 'x', type: 'a', created: T, data: { object: {} } })],
  ])('refuses a signed body that is %s with 400', async (_name, body) => {
    const { service, em } = setup();

    await expect(service.receive(body, signed(body))).rejects.toMatchObject({ message: WEBHOOK_PAYLOAD_MESSAGE });
    expect(em.execute).not.toHaveBeenCalled();
  });
});
