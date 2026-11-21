import { apiHandler, BOOKING_RESPONSE, releasePayouts } from '@devmentor/core/http';

export const POST = apiHandler(releasePayouts, BOOKING_RESPONSE);
