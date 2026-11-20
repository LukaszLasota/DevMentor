import { apiHandler, MENTOR_OWNER_RESPONSE, updateOwnMentorPrices } from '@devmentor/core/http';

export const PUT = apiHandler(updateOwnMentorPrices, MENTOR_OWNER_RESPONSE);
