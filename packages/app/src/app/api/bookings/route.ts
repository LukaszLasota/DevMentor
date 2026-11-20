import { apiHandler, BOOKING_RESPONSE, startBooking } from '@devmentor/core/http';

export const POST = apiHandler(startBooking, BOOKING_RESPONSE);
