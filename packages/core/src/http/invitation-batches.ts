import type { InvitationOverview, OpenedBatch } from '../services/invitations/invitation-batch.service';
import { invitationCreateSchema } from '../validators/invitations/invitation-create.schema';
import type { ApiHandlerOptions, HandlerArgs, RouteParams } from './apiHandler';
import { requireRole, requireSession } from './auth';
import { parseJsonBody } from './parse';

// Operator routes of invitation batches (spec 2026-11-24-invitation-batches), as `apiHandler` handlers.
// The services repeat the operator check on the session actor; no response carries a token or link.

/** Invited emails and mentor names: operators only, never cached. */
export const INVITATION_BATCHES_RESPONSE: ApiHandlerOptions = { headers: { 'Cache-Control': 'no-store' } };

/** The two creating POSTs answer 201. */
export const INVITATION_CREATED_RESPONSE: ApiHandlerOptions = { successStatus: 201, headers: { 'Cache-Control': 'no-store' } };

/** What `POST /api/admin/invitations` returns: never the token or the link (it is in the email only). */
export interface InvitationSent {
  id: string;
  email: string;
  batchNumber: number;
  /** Invitations in the batch, this one included. */
  sent: number;
}

async function requireOperator({ req, cradle }: HandlerArgs<RouteParams>) {
  const operator = await requireSession(req, cradle);
  requireRole(operator, 'operator');

  return operator;
}

/** `GET /api/admin/invitation-batches` → every batch with counts and rows in words. */
export async function getInvitationBatches(args: HandlerArgs<RouteParams>): Promise<InvitationOverview> {
  const operator = await requireOperator(args);

  return args.cradle.invitationBatchService.overview(operator);
}

/** `POST /api/admin/invitation-batches` → the opened batch (logged as an operator action by the service). */
export async function openInvitationBatch(args: HandlerArgs<RouteParams>): Promise<OpenedBatch> {
  const operator = await requireOperator(args);

  return args.cradle.invitationBatchService.open(operator);
}

/** `POST /api/admin/invitations` `{ email, stackTags }` → the invitation, emailed before it was saved. */
export async function createInvitation(args: HandlerArgs<RouteParams>): Promise<InvitationSent> {
  const operator = await requireOperator(args);
  const { email, stackTags } = await parseJsonBody(args.req, invitationCreateSchema);
  const created = await args.cradle.invitationService.create({ email, tags: stackTags }, { kind: 'session', user: operator });

  return { id: created.invitation.id, email: created.invitation.email, batchNumber: created.batchNumber, sent: created.sent };
}
