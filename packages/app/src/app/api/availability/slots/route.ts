import { apiHandler, listMySlots, MENTOR_OWNER_RESPONSE, publishSlot } from '@devmentor/core/http';

export const GET = apiHandler(listMySlots, MENTOR_OWNER_RESPONSE);
export const POST = apiHandler(publishSlot, MENTOR_OWNER_RESPONSE);
