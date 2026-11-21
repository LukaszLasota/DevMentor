import { apiHandler, BOOKING_RESPONSE, refreshConnect } from '@devmentor/core/http';

export const POST = apiHandler(refreshConnect, BOOKING_RESPONSE);
