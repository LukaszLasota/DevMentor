import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Cradle } from '../container/cradle';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { NotFoundError } from './errors';
import { makeCrudRoute, type CrudService } from './makeCrudRoute';

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: Cradle) => Promise<T>) => fn({} as Cradle),
}));

interface Note {
  id: string;
  title: string;
}

const ID = '7f1b2d3c-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const createSchema = z.object({ title: z.string().min(1) });
const updateSchema = createSchema.partial();

function setup() {
  const service: CrudService<Note, z.output<typeof createSchema>, z.output<typeof updateSchema>> = {
    list: vi.fn(async () => [{ id: ID, title: 'a' }]),
    get: vi.fn(async (id: string) => {
      if (id !== ID) throw new NotFoundError();
      return { id, title: 'a' };
    }),
    create: vi.fn(async (input) => ({ id: ID, ...input })),
    update: vi.fn(async (id, input) => ({ id, title: 'a', ...input })),
    delete: vi.fn(async () => undefined),
  };
  const route = makeCrudRoute({ service: () => service, createSchema, updateSchema });

  return { service, route };
}

const ctx = { params: Promise.resolve({}) };
const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE, 'content-type': 'application/json' };

function req(method: string, query = '', body?: unknown): Request {
  return new Request(`http://localhost/api/notes${query}`, {
    method,
    headers: method === 'GET' ? {} : csrf,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('makeCrudRoute', () => {
  it('GET without id lists records', async () => {
    const { route, service } = setup();

    const res = await route.GET(req('GET'), ctx);

    expect(await res.json()).toEqual({ ok: true, data: [{ id: ID, title: 'a' }] });
    expect(service.list).toHaveBeenCalled();
  });

  it('GET with id returns one record, 404 when missing', async () => {
    const { route } = setup();

    expect((await (await route.GET(req('GET', `?id=${ID}`), ctx)).json()).data).toEqual({ id: ID, title: 'a' });
    expect((await route.GET(req('GET', '?id=00000000-0000-4000-8000-000000000000'), ctx)).status).toBe(404);
  });

  it('GET with a malformed id is a validation error', async () => {
    const { route } = setup();

    expect((await route.GET(req('GET', '?id=1'), ctx)).status).toBe(400);
  });

  it('POST validates the body and returns 201', async () => {
    const { route, service } = setup();

    const res = await route.POST(req('POST', '', { title: 'New' }), ctx);

    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith({ title: 'New' });
  });

  it('POST passes only schema-parsed fields to the service (no mass assignment)', async () => {
    const { route, service } = setup();

    await route.POST(req('POST', '', { title: 'New', id: 'smuggled', status: 'confirmed' }), ctx);

    expect(service.create).toHaveBeenCalledWith({ title: 'New' });
  });

  it('POST with an invalid body returns field errors and skips the service', async () => {
    const { route, service } = setup();

    const res = await route.POST(req('POST', '', { title: '' }), ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(Object.keys(body.error.fieldErrors)).toEqual(['title']);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('POST with malformed JSON is a validation error', async () => {
    const { route } = setup();

    const res = await route.POST(req('POST', '', '{not json'), ctx);

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe('Request body must be valid JSON.');
  });

  it('PUT requires an id and updates the record', async () => {
    const { route, service } = setup();

    expect((await route.PUT(req('PUT', '', { title: 'x' }), ctx)).status).toBe(400);

    const res = await route.PUT(req('PUT', `?id=${ID}`, { title: 'Renamed' }), ctx);

    expect((await res.json()).data).toEqual({ id: ID, title: 'Renamed' });
    expect(service.update).toHaveBeenCalledWith(ID, { title: 'Renamed' });
  });

  it('DELETE removes the record and returns null data', async () => {
    const { route, service } = setup();

    const res = await route.DELETE(req('DELETE', `?id=${ID}`), ctx);

    expect(await res.json()).toEqual({ ok: true, data: null });
    expect(service.delete).toHaveBeenCalledWith(ID);
  });

  it('mutations without the CSRF header are rejected', async () => {
    const { route, service } = setup();
    const res = await route.POST(
      new Request('http://localhost/api/notes', { method: 'POST', body: JSON.stringify({ title: 'x' }) }),
      ctx,
    );

    expect(res.status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });
});
