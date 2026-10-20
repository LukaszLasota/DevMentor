import { z } from 'zod';
import type { Cradle } from '../container/cradle';
import { apiHandler } from './apiHandler';
import { parseJsonBody, parseSearchParams } from './parse';

/** Service contract for a plain CRUD resource; `get`/`update`/`delete` throw `NotFoundError`. */
export interface CrudService<TEntity, TCreate, TUpdate> {
  list(): Promise<TEntity[]>;
  get(id: string): Promise<TEntity>;
  create(input: TCreate): Promise<TEntity>;
  update(id: string, input: TUpdate): Promise<TEntity>;
  delete(id: string): Promise<void>;
}

export interface MakeCrudRouteOptions<TEntity, CS extends z.ZodType, US extends z.ZodType> {
  service: (cradle: Cradle) => CrudService<TEntity, z.output<CS>, z.output<US>>;
  createSchema: CS;
  updateSchema: US;
}

const HTTP_CREATED = 201;
const idQuerySchema = z.object({ id: z.uuid() });
const optionalIdQuerySchema = z.object({ id: z.uuid().optional() });

/**
 * Builds `{ GET, POST, PUT, DELETE }` for a plain CRUD resource; re-export it from `route.ts`.
 * The record id travels as `?id=<uuid>`: GET without it lists, GET/PUT/DELETE with it target one record.
 * Workflow endpoints (booking, payment, ...) use `apiHandler` directly instead.
 */
export function makeCrudRoute<TEntity, CS extends z.ZodType, US extends z.ZodType>(
  options: MakeCrudRouteOptions<TEntity, CS, US>,
) {
  const { service, createSchema, updateSchema } = options;

  return {
    GET: apiHandler<TEntity | TEntity[]>(async ({ req, cradle }) => {
      const { id } = parseSearchParams(req, optionalIdQuerySchema);

      return id ? service(cradle).get(id) : service(cradle).list();
    }),
    POST: apiHandler<TEntity>(
      async ({ req, cradle }) => service(cradle).create(await parseJsonBody(req, createSchema)),
      { successStatus: HTTP_CREATED },
    ),
    PUT: apiHandler<TEntity>(async ({ req, cradle }) => {
      const { id } = parseSearchParams(req, idQuerySchema);

      return service(cradle).update(id, await parseJsonBody(req, updateSchema));
    }),
    DELETE: apiHandler<null>(async ({ req, cradle }) => {
      const { id } = parseSearchParams(req, idQuerySchema);
      await service(cradle).delete(id);

      return null;
    }),
  };
}
