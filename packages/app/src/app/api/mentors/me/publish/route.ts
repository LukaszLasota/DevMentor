import { apiHandler, MENTOR_OWNER_RESPONSE, publishOwnMentorPage } from '@devmentor/core/http';

export const POST = apiHandler(publishOwnMentorPage, MENTOR_OWNER_RESPONSE);
