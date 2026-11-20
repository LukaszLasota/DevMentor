import { apiHandler, BOOKING_RESPONSE, retryBookingRefund } from '@devmentor/core/http';

export const POST = apiHandler(retryBookingRefund, BOOKING_RESPONSE);
