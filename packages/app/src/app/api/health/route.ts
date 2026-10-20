import { apiHandler } from '@devmentor/core/http';

export const GET = apiHandler(({ cradle }) => cradle.healthService.check());
