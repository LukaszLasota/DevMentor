import { apiHandler, listMentors, MENTOR_LIST_RESPONSE } from '@devmentor/core/http';

export const GET = apiHandler(listMentors, MENTOR_LIST_RESPONSE);
