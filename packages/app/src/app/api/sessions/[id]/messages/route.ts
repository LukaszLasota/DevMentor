import { apiHandler, SESSION_RESPONSE, sendSessionMessage } from '@devmentor/core/http';

export const POST = apiHandler(sendSessionMessage, SESSION_RESPONSE);
