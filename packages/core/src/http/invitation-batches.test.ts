import { User } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession } from '../security/session-token';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ConflictError } from './errors';
import {
  createInvitation,
  getInvitationBatches,
  INVITATION_BATCHES_RESPONSE,
  INVITATION_CREATED_RESPONSE,
  openInvitationBatch,
} from './invitation-batches';

// Through the real apiHandler with fake services; the rules are tested in the services and end to end
// in `packages/app/integration/invitation-batches*.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-11-24T12:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const GET = apiHandler(getInvitationBatches, INVITATION_BATCHES_RESPONSE);
const OPEN = apiHandler(openInvitationBatch, INVITATION_CREATED_RESPONSE);
const INVITE = apiHandler(createInvitation, INVITATION_CREATED_RESPONSE);
const OVERVIEW = { stopped: false, canOpen: true, nextBatchNumber: 1, batches: [], beforeBatches: [] };
const LINK = 'https://app.devmentor.test/invitation/raw-token-value';

let roles: string[];
let services: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  roles = ['operator'];
  const user = Object.assign(new User(), { id: USER_ID, email: 'op@devmentor.test', sessionVersion: 0 });
  Object.defineProperty(user, 'roles', { get: () => roles });
  services = {
    invitationBatchService: {
      overview: vi.fn(async () => OVERVIEW),
      open: vi.fn(async () => ({ number: 1, openedAt: '2026-11-24T12:00:00.000Z' })),
    },
    invitationService: {
      create: vi.fn(async () => ({
        invitation: { id: 'inv-1', email: 'anna@example.com' },
        link: LINK,
        batchNumber: 1,
        sent: 1,
      })),
    },
  };
  scope.cradle = {
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET }),
    clock,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    em: { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) },
    accountService: { reconcileOperator: vi.fn(async (u: User) => u) },
    ...services,
  };
});

async function request({ method = 'POST', csrf = true, signedIn = true, body }: { method?: string; csrf?: boolean; signedIn?: boolean; body?: unknown } = {}): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (signedIn) headers.cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

  return new Request('http://localhost/api/admin/x', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const noParams = { params: Promise.resolve({}) };
const VALID = { email: ' Anna@Example.COM ', stackTags: ['react'] };

describe('invitation batch routes', () => {
  it('GET returns the overview for an operator, never cached', async () => {
    const res = await GET(await request({ method: 'GET', csrf: false }), noParams);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, data: OVERVIEW });
    expect(services.invitationBatchService?.overview).toHaveBeenCalledWith(expect.objectContaining({ id: USER_ID }));
  });

  it('POST opens a batch as the session operator (201)', async () => {
    const res = await OPEN(await request(), noParams);

    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, data: { number: 1, openedAt: '2026-11-24T12:00:00.000Z' } });
  });

  it('POST invitations passes the parsed body and a session actor; the response has no token, hash or link', async () => {
    const res = await INVITE(await request({ body: VALID }), noParams);

    expect(res.status).toBe(201);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, data: { id: 'inv-1', email: 'anna@example.com', batchNumber: 1, sent: 1 } });
    expect(text).not.toMatch(/token|tokenHash|link|raw-token-value/i);
    expect(services.invitationService?.create).toHaveBeenCalledWith(
      { email: 'anna@example.com', tags: ['react'] },
      { kind: 'session', user: expect.objectContaining({ id: USER_ID }) },
    );
  });

  it('refuses an invalid body with 400 field errors before the service', async () => {
    const res = await INVITE(await request({ body: { email: 'anna', stackTags: [], batch: 'x' } }), noParams);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(services.invitationService?.create).not.toHaveBeenCalled();
  });

  it('answers 401 signed out, 403 without CSRF or the operator role, on every route', async () => {
    expect((await GET(await request({ method: 'GET', csrf: false, signedIn: false }), noParams)).status).toBe(401);
    expect((await OPEN(await request({ signedIn: false }), noParams)).status).toBe(401);
    expect((await INVITE(await request({ signedIn: false, body: VALID }), noParams)).status).toBe(401);
    expect((await OPEN(await request({ csrf: false }), noParams)).status).toBe(403);
    expect((await INVITE(await request({ csrf: false, body: VALID }), noParams)).status).toBe(403);

    roles = ['mentee', 'mentor'];
    expect((await GET(await request({ method: 'GET', csrf: false }), noParams)).status).toBe(403);
    expect((await OPEN(await request(), noParams)).status).toBe(403);
    expect((await INVITE(await request({ body: VALID }), noParams)).status).toBe(403);
    expect(services.invitationBatchService?.overview).not.toHaveBeenCalled();
    expect(services.invitationBatchService?.open).not.toHaveBeenCalled();
    expect(services.invitationService?.create).not.toHaveBeenCalled();
  });

  it('maps a service refusal to its code and keeps no-store on errors', async () => {
    services.invitationBatchService?.open?.mockRejectedValueOnce(new ConflictError('A batch is already open.', { code: 'BATCH_ALREADY_OPEN' }));

    const res = await OPEN(await request(), noParams);

    expect(res.status).toBe(409);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).error).toEqual({ code: 'BATCH_ALREADY_OPEN', message: 'A batch is already open.' });
  });
});
