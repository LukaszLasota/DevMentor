import { apiHandler, getOwnMentorPage, MENTOR_OWNER_RESPONSE, updateOwnMentorPage } from '@devmentor/core/http';

export const GET = apiHandler(getOwnMentorPage, MENTOR_OWNER_RESPONSE);
export const PUT = apiHandler(updateOwnMentorPage, MENTOR_OWNER_RESPONSE);
