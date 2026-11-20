import { z } from 'zod';
import type { SessionAnswerView, SessionMessageView, SessionView } from '../services/sessions/session.service';
import { SESSION_NOT_FOUND_MESSAGE } from '../services/sessions/session.service';
import type { NoteView } from '../services/sessions/session-note.service';
import { sessionAnswerSchema, sessionMessageSchema, sessionReadQuerySchema } from '../validators/sessions/session-message.schema';
import { sessionNoteDecisionSchema, sessionNoteSchema } from '../validators/sessions/session-note.schema';
import type { ApiHandlerOptions, HandlerArgs } from './apiHandler';
import { requireSession } from './auth';
import { NotFoundError } from './errors';
import { parseJsonBody, parseSearchParams } from './parse';

// Session routes (spec 2026-11-20-text-session, API Contracts) as `apiHandler` handlers; the app's route
// files only wire them. The caller is always the session user; `SessionService` decides whether they
// are a party (anyone else: 404).

/** Private conversation: never cached. */
export const SESSION_RESPONSE: ApiHandlerOptions = { headers: { 'Cache-Control': 'no-store' } };

/** Route params of `/api/sessions/[id]`. */
export type SessionIdParams = { id: string };

function sessionId(params: SessionIdParams): string {
  if (!z.uuid().safeParse(params.id).success) {
    throw new NotFoundError(SESSION_NOT_FOUND_MESSAGE);
  }

  return params.id;
}

/** `GET /api/sessions/[id]?after=<seq>` → the session with the messages after the cursor. */
export async function getSession({ req, params, cradle }: HandlerArgs<SessionIdParams>): Promise<SessionView> {
  const user = await requireSession(req, cradle);
  const id = sessionId(params);

  return cradle.sessionService.get(user.id, id, parseSearchParams(req, sessionReadQuerySchema));
}

/** `POST /api/sessions/[id]/messages` `{ body }` → the stored message. */
export async function sendSessionMessage({ req, params, cradle }: HandlerArgs<SessionIdParams>): Promise<SessionMessageView> {
  const user = await requireSession(req, cradle);
  const id = sessionId(params);

  return cradle.sessionService.send(user.id, id, await parseJsonBody(req, sessionMessageSchema));
}

/** `POST /api/sessions/[id]/answer` `{ body }` → the mentor's written answer. */
export async function submitSessionAnswer({ req, params, cradle }: HandlerArgs<SessionIdParams>): Promise<SessionAnswerView> {
  const user = await requireSession(req, cradle);
  const id = sessionId(params);

  return cradle.sessionService.answer(user.id, id, await parseJsonBody(req, sessionAnswerSchema));
}

/** `GET /api/sessions/[id]/note` → the session note and what the caller can do with it. */
export async function getSessionNote({ req, params, cradle }: HandlerArgs<SessionIdParams>): Promise<NoteView> {
  const user = await requireSession(req, cradle);

  return cradle.sessionNoteService.get(user.id, sessionId(params));
}

/** `POST /api/sessions/[id]/note` `{ body }` → the mentor sends the next version. */
export async function sendSessionNote({ req, params, cradle }: HandlerArgs<SessionIdParams>): Promise<NoteView> {
  const user = await requireSession(req, cradle);
  const id = sessionId(params);

  return cradle.sessionNoteService.send(user.id, id, await parseJsonBody(req, sessionNoteSchema));
}

/** `POST /api/sessions/[id]/note/decision` `{ version, decision, comment? }` → the mentee decides. */
export async function decideSessionNote({ req, params, cradle }: HandlerArgs<SessionIdParams>): Promise<NoteView> {
  const user = await requireSession(req, cradle);
  const id = sessionId(params);

  return cradle.sessionNoteService.decide(user.id, id, await parseJsonBody(req, sessionNoteDecisionSchema));
}
