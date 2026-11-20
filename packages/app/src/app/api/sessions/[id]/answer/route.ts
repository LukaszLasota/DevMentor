import { apiHandler, SESSION_RESPONSE, submitSessionAnswer } from '@devmentor/core/http';

export const POST = apiHandler(submitSessionAnswer, SESSION_RESPONSE);
