import { z } from 'zod';
import type { SlotView } from '../services/availability/slot.service';
import { slotCreateSchema } from '../validators/availability/slot-create.schema';
import type { HandlerArgs, RouteParams } from './apiHandler';
import { requireMentor } from './mentors';
import { parseJsonBody, parseSearchParams } from './parse';

// Slot routes as `apiHandler` handlers (spec 2026-10-21-availability-slots, API Contracts); the app's
// route files only wire them with `MENTOR_OWNER_RESPONSE` (no-store). The owner is always the session
// user; `SlotService` scopes every query by that user's profile (404 without one).

/** Route params of `/api/availability/slots/[id]` (a type, not an interface: it must fit `RouteParams`). */
export type SlotIdParams = { id: string };

const listQuery = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') });

/** `GET /api/availability/slots?scope=upcoming|past` (mentor) → `{ items }`. */
export async function listMySlots({ req, cradle }: HandlerArgs<RouteParams>): Promise<{ items: SlotView[] }> {
  const user = await requireMentor(req, cradle);
  const { scope } = parseSearchParams(req, listQuery);

  return { items: await cradle.slotService.listMine(user.id, scope) };
}

/** `POST /api/availability/slots` (mentor) → the new slot; 400 on `startsAt`, 409 duplicate or cap. */
export async function publishSlot({ req, cradle }: HandlerArgs<RouteParams>): Promise<SlotView> {
  const user = await requireMentor(req, cradle);
  const input = await parseJsonBody(req, slotCreateSchema);

  return cradle.slotService.publish(user.id, input);
}

/** `DELETE /api/availability/slots/[id]` (mentor) → `{ id }`; 404 unless it is the caller's active slot. */
export async function removeSlot({ req, params, cradle }: HandlerArgs<SlotIdParams>): Promise<{ id: string }> {
  const user = await requireMentor(req, cradle);

  return cradle.slotService.remove(user.id, params.id);
}
