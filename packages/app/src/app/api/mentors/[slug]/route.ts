import { apiHandler, getPublicMentorPage, MENTOR_PAGE_RESPONSE } from '@devmentor/core/http';

export const GET = apiHandler(getPublicMentorPage, MENTOR_PAGE_RESPONSE);
