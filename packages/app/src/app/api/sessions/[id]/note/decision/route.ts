import { apiHandler, decideSessionNote, SESSION_RESPONSE } from '@devmentor/core/http';

export const POST = apiHandler(decideSessionNote, SESSION_RESPONSE);
