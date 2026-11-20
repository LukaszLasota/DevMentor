import type { SessionUser } from '../auth/session-user';
import type { Cradle } from '../container/cradle';
import type { MentorOwnerView, MentorPublicView } from '../services/mentors/mentor-profile.service';
import { mentorProfileUpdateSchema } from '../validators/mentors/mentor-profile-update.schema';
import type { ApiHandlerOptions, HandlerArgs, RouteParams } from './apiHandler';
import { requireRole, requireSession } from './auth';
import { parseJsonBody } from './parse';

// Mentor page routes as `apiHandler` handlers (spec 2026-10-21-mentor-page, API Contracts); the
// app's route files only wire them. The owner is always the session user, never a request value.

/** Owner routes carry private data (the publish deadline, the draft): nothing may keep the answer. */
export const MENTOR_OWNER_RESPONSE: ApiHandlerOptions = { headers: { 'Cache-Control': 'no-store' } };

/** Route params of `/api/mentors/[slug]` (a type, not an interface: it must fit `RouteParams`). */
export type MentorSlugParams = { slug: string };

/** The session user, who must hold `mentor` (401 / 403); shared by the mentor-owned routes. */
export async function requireMentor(req: Request, cradle: Cradle): Promise<SessionUser> {
  const user = await requireSession(req, cradle);
  requireRole(user, 'mentor');

  return user;
}

/** `GET /api/mentors/me` (mentor) → the owner DTO. */
export async function getOwnMentorPage({ req, cradle }: HandlerArgs<RouteParams>): Promise<MentorOwnerView> {
  const user = await requireMentor(req, cradle);

  return cradle.mentorProfileService.getOwn(user.id);
}

/** `PUT /api/mentors/me` (mentor) → the owner DTO; a published page must stay complete (400). */
export async function updateOwnMentorPage({ req, cradle }: HandlerArgs<RouteParams>): Promise<MentorOwnerView> {
  const user = await requireMentor(req, cradle);
  const input = await parseJsonBody(req, mentorProfileUpdateSchema);

  return cradle.mentorProfileService.updateOwn(user.id, input);
}

/** `POST /api/mentors/me/publish` (mentor) → the owner DTO; 400 per missing item, 409 when no slug could be reserved. */
export async function publishOwnMentorPage({ req, cradle }: HandlerArgs<RouteParams>): Promise<MentorOwnerView> {
  const user = await requireMentor(req, cradle);

  return cradle.mentorProfileService.publish(user.id);
}

/** `POST /api/mentors/me/unpublish` (mentor) → the owner DTO with `publishedAt: null`, slug kept. */
export async function unpublishOwnMentorPage({ req, cradle }: HandlerArgs<RouteParams>): Promise<MentorOwnerView> {
  const user = await requireMentor(req, cradle);

  return cradle.mentorProfileService.unpublish(user.id);
}

/** `GET /api/mentors/[slug]` (public) → the public DTO; 404 unless published and owned by a mentor. */
export async function getPublicMentorPage({ params, cradle }: HandlerArgs<MentorSlugParams>): Promise<MentorPublicView> {
  return cradle.mentorProfileService.getPublicBySlug(params.slug);
}
