import { apiHandler, MENTOR_OWNER_RESPONSE, unpublishOwnMentorPage } from '@devmentor/core/http';

export const POST = apiHandler(unpublishOwnMentorPage, MENTOR_OWNER_RESPONSE);
