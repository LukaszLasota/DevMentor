import { apiHandler, BOOKING_RESPONSE, cancelOwnBooking } from '@devmentor/core/http';

export const POST = apiHandler(cancelOwnBooking, BOOKING_RESPONSE);
