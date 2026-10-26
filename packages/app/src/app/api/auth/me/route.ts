import { apiHandler, requireSession } from '@devmentor/core/http';

export const GET = apiHandler(async ({ req, cradle }) => ({ user: await requireSession(req, cradle) }));
