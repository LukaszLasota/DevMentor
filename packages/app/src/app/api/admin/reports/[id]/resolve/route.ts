import { apiHandler, BOOKING_RESPONSE, resolveReport } from '@devmentor/core/http';

export const POST = apiHandler(resolveReport, BOOKING_RESPONSE);
