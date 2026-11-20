import { z } from 'zod';
import type { Cradle } from '../../container/cradle';
import { isAppError } from '../../http/errors';
import type { UpstreamResponse } from '../../http/outbound';

/** Pinned Stripe API version: responses keep this shape until the constant is changed on purpose. */
export const STRIPE_API_VERSION = '2024-06-20';

/** Form values Stripe accepts; nested objects and arrays become `a[b][0]=…` keys. */
export type StripeParam = string | number | boolean | undefined | StripeParam[] | { [key: string]: StripeParam };
export type StripeParams = Record<string, StripeParam>;

/**
 * Classified result of one Stripe call (contract shared with #26, spec 2026-10-21-stripe-connect-payouts):
 * - `ok` — 2xx with a body matching the caller's schema;
 * - `retryable` — timeout, network, 5xx, 429, 409 `idempotency_key_in_use` / `lock_timeout`, or an
 *   unexpected 2xx body;
 * - `idempotency_mismatch` — 400 `idempotency_error`: the same key was used with other parameters;
 * - `rejected` — any other deterministic 4xx, with Stripe's error `code` when it gave one;
 * - `misconfigured` — 401, or no `STRIPE_SECRET_KEY`.
 * Callers never see raw response bodies.
 */
export type StripeOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'retryable' }
  | { kind: 'idempotency_mismatch' }
  | { kind: 'rejected'; status: number; code: string | null }
  | { kind: 'misconfigured' };

const stripeErrorSchema = z.object({
  error: z.object({ type: z.string().optional(), code: z.string().optional() }),
});

const RETRYABLE_CONFLICT_CODES = new Set(['idempotency_key_in_use', 'lock_timeout']);

/** `{ a: { b: [1] } }` → `a[b][0]=1`; `undefined` values are left out. */
export function encodeStripeForm(params: StripeParams): string {
  const form = new URLSearchParams();

  const add = (key: string, value: StripeParam): void => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => add(`${key}[${index}]`, item));
    } else if (typeof value === 'object') {
      for (const [child, item] of Object.entries(value)) {
        add(`${key}[${child}]`, item);
      }
    } else {
      form.append(key, String(value));
    }
  };

  for (const [key, value] of Object.entries(params)) {
    add(key, value);
  }

  return form.toString();
}

export interface StripeRequest<T> {
  method: 'GET' | 'POST';
  /** Path below the API base, e.g. `/v1/checkout/sessions`. */
  path: string;
  params?: StripeParams;
  idempotencyKey?: string;
  schema: z.ZodType<T>;
}

/**
 * Small form-encoded Stripe client over `fetchJson` (no SDK, engineering standards §1). Bearer
 * `STRIPE_SECRET_KEY`, pinned `Stripe-Version`, optional `Idempotency-Key`, base `STRIPE_API_URL`.
 * Logs method, path, status and Stripe's error type/code only — never parameters, bodies or the key.
 */
export class StripeClient {
  private readonly env: Cradle['env'];
  private readonly fetchJson: Cradle['fetchJson'];
  private readonly logger: Cradle['logger'];

  constructor({ env, fetchJson, logger }: Pick<Cradle, 'env' | 'fetchJson' | 'logger'>) {
    this.env = env;
    this.fetchJson = fetchJson;
    this.logger = logger;
  }

  /** Whether a secret key is configured; without one every call is `misconfigured`. */
  get configured(): boolean {
    return this.env.STRIPE_SECRET_KEY !== undefined;
  }

  async request<T>({ method, path, params = {}, idempotencyKey, schema }: StripeRequest<T>): Promise<StripeOutcome<T>> {
    const secretKey = this.env.STRIPE_SECRET_KEY;
    const upstream = { method, path };

    if (secretKey === undefined) {
      this.logger.warn({ upstream }, 'Stripe is not configured: STRIPE_SECRET_KEY is missing');

      return { kind: 'misconfigured' };
    }

    const form = encodeStripeForm(params);
    const url = new URL(`${this.env.STRIPE_API_URL}${path}`);
    const headers: Record<string, string> = {
      authorization: `Bearer ${secretKey}`,
      'stripe-version': STRIPE_API_VERSION,
    };

    if (idempotencyKey !== undefined) {
      headers['idempotency-key'] = idempotencyKey;
    }

    let response: UpstreamResponse;

    try {
      if (method === 'GET') {
        url.search = form;
        response = await this.fetchJson(url, { method, headers, withStatus: true });
      } else {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        response = await this.fetchJson(url, { method, headers, body: form, withStatus: true });
      }
    } catch (error) {
      // fetchJson already logged the timeout or network failure (503).
      if (isAppError(error) && error.status === 503) {
        return { kind: 'retryable' };
      }

      throw error;
    }

    return this.classify(response, schema, upstream);
  }

  private classify<T>(
    { status, body }: UpstreamResponse,
    schema: z.ZodType<T>,
    upstream: { method: string; path: string },
  ): StripeOutcome<T> {
    if (status >= 200 && status < 300) {
      const parsed = schema.safeParse(body);

      if (parsed.success) {
        return { kind: 'ok', data: parsed.data };
      }

      this.logger.warn({ upstream: { ...upstream, status } }, 'Stripe returned an unexpected response');

      return { kind: 'retryable' };
    }

    const error = stripeErrorSchema.safeParse(body);
    const type = error.success ? (error.data.error.type ?? null) : null;
    const code = error.success ? (error.data.error.code ?? null) : null;
    const log = (message: string) => this.logger.warn({ upstream: { ...upstream, status }, stripe: { type, code } }, message);

    if (status === 401) {
      log('Stripe rejected the API key');

      return { kind: 'misconfigured' };
    }

    if (status >= 500 || status === 429 || (status === 409 && code !== null && RETRYABLE_CONFLICT_CODES.has(code))) {
      log('Stripe request failed, retryable');

      return { kind: 'retryable' };
    }

    if (status === 400 && type === 'idempotency_error') {
      log('Stripe idempotency key reused with different parameters');

      return { kind: 'idempotency_mismatch' };
    }

    log('Stripe rejected the request');

    return { kind: 'rejected', status, code };
  }
}
