import { apiHandler, MENTOR_OWNER_RESPONSE, removeSlot } from '@devmentor/core/http';

export const DELETE = apiHandler(removeSlot, MENTOR_OWNER_RESPONSE);
