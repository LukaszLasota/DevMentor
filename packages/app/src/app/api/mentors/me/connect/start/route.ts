import { apiHandler, BOOKING_RESPONSE, startConnect } from '@devmentor/core/http';

export const POST = apiHandler(startConnect, BOOKING_RESPONSE);
