import { User } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession } from '../security/session-token';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';
import { getSession, SESSION_RESPONSE, sendSessionMessage, submitSessionAnswer } from './sessions';

// The handlers run through the real apiHandler with a fake SessionService: its rules are tested in
// `session.service.test.ts` and end to end in `packages/app/integration/text-session.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-06-22T16:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const SESSION_ID = '7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60';
const GET = apiHandler(getSession, SESSION_RESPONSE);
const SEND = apiHandler(sendSessionMessage, SESSION_RESPONSE);
const ANSWER = apiHandler(submitSessionAnswer, SESSION_RESPONSE);
const LONG = 'Use a queue for the retries and keep it idempotent.';

let sessionService: { get: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; answer: ReturnType<typeof vi.fn> };

beforeEach(() => {
  const user = Object.assign(new User(), { id: USER_ID, email: 'mentee@devmentor.test', roles: ['mentee'], sessionVersion: 0 });
  sessionService = {
    get: vi.fn(async () => ({ id: SESSION_ID })),
    send: vi.fn(async () => ({ id: 'm-1' })),
    answer: vi.fn(async () => ({ body: LONG })),
  };
  scope.cradle = {
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET }),
    clock,
    logger: { warn: vi.fn(), error: vi.fn() },
    em: { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) },
    accountService: { reconcileOperator: vi.fn(async (u: User) => u) },
    sessionService,
  };
});

async function request(
  method: 'GET' | 'POST',
  { csrf = true, signedIn = true, body, query = '' }: { csrf?: boolean; signedIn?: boolean; body?: unknown; query?: string } = {},
): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (signedIn) headers.cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

  return new Request(`http://localhost/api/sessions/x${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const params = (id = SESSION_ID) => ({ params: Promise.resolve({ id }) });

describe('GET /api/sessions/[id]', () => {
  it('reads the session for the caller with the parsed cursor, never cached', async () => {
    const response = await GET(await request('GET', { query: '?after=3' }), params());

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: { id: SESSION_ID } });
    expect(sessionService.get).toHaveBeenCalledWith(USER_ID, SESSION_ID, { after: 3 });
  });

  it('answers 401 signed out, 404 for a malformed id or from the service, 400 for a bad cursor', async () => {
    expect((await GET(await request('GET', { signedIn: false }), params())).status).toBe(401);
    expect((await GET(await request('GET'), params('x'))).status).toBe(404);
    expect((await GET(await request('GET', { query: '?after=-1' }), params())).status).toBe(400);

    sessionService.get.mockRejectedValueOnce(new NotFoundError('Session not found.'));
    expect((await GET(await request('GET'), params())).status).toBe(404);
  });
});

describe('POST /api/sessions/[id]/messages', () => {
  it('sends the trimmed body only', async () => {
    const response = await SEND(await request('POST', { body: { body: '  Hi  ', author: 'x' } }), params());

    expect(await response.json()).toEqual({ ok: true, data: { id: 'm-1' } });
    expect(sessionService.send).toHaveBeenCalledWith(USER_ID, SESSION_ID, { body: 'Hi' });
  });

  it('answers 403 without CSRF, 400 for an empty body, 409 with the service code', async () => {
    expect((await SEND(await request('POST', { csrf: false, body: { body: 'Hi' } }), params())).status).toBe(403);
    expect((await SEND(await request('POST', { body: { body: ' ' } }), params())).status).toBe(400);
    expect(sessionService.send).not.toHaveBeenCalled();

    sessionService.send.mockRejectedValueOnce(new ConflictError('Closed.', { code: 'SESSION_NOT_OPEN' }));
    const closed = await SEND(await request('POST', { body: { body: 'Hi' } }), params());
    expect([closed.status, (await closed.json()).error.code]).toEqual([409, 'SESSION_NOT_OPEN']);
  });
});

describe('POST /api/sessions/[id]/answer', () => {
  it('submits the answer, and maps 403 and 409 from the service', async () => {
    expect(await (await ANSWER(await request('POST', { body: { body: LONG } }), params())).json()).toEqual({ ok: true, data: { body: LONG } });
    expect(sessionService.answer).toHaveBeenCalledWith(USER_ID, SESSION_ID, { body: LONG });

    sessionService.answer.mockRejectedValueOnce(new ForbiddenError('Mentor only.'));
    expect((await ANSWER(await request('POST', { body: { body: LONG } }), params())).status).toBe(403);

    sessionService.answer.mockRejectedValueOnce(new ConflictError('Again.', { code: 'ALREADY_ANSWERED' }));
    const again = await ANSWER(await request('POST', { body: { body: LONG } }), params());
    expect((await again.json()).error.code).toBe('ALREADY_ANSWERED');
  });

  it('answers 400 for a short answer and 404 for a malformed id', async () => {
    expect((await ANSWER(await request('POST', { body: { body: 'short' } }), params())).status).toBe(400);
    expect((await ANSWER(await request('POST', { body: { body: LONG } }), params('x'))).status).toBe(404);
    expect(sessionService.answer).not.toHaveBeenCalled();
  });
});
