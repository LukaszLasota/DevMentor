import { apiHandler, getSessionNote, SESSION_RESPONSE, sendSessionNote } from '@devmentor/core/http';

export const GET = apiHandler(getSessionNote, SESSION_RESPONSE);
export const POST = apiHandler(sendSessionNote, SESSION_RESPONSE);
