import { apiHandler, BOOKING_RESPONSE, releaseOwnBooking } from '@devmentor/core/http';

export const POST = apiHandler(releaseOwnBooking, BOOKING_RESPONSE);
