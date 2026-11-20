import { apiHandler, BOOKING_RESPONSE, reportOwnBooking } from '@devmentor/core/http';

export const POST = apiHandler(reportOwnBooking, BOOKING_RESPONSE);
