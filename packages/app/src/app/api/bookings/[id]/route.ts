import { apiHandler, BOOKING_RESPONSE, getOwnBooking } from '@devmentor/core/http';

export const GET = apiHandler(getOwnBooking, BOOKING_RESPONSE);
