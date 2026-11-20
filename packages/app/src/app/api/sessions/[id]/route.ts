import { apiHandler, getSession, SESSION_RESPONSE } from '@devmentor/core/http';

export const GET = apiHandler(getSession, SESSION_RESPONSE);
