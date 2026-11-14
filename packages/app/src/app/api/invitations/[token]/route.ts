import { apiHandler, INVITATION_RESPONSE, lookupInvitation } from '@devmentor/core/http';

export const GET = apiHandler(lookupInvitation, INVITATION_RESPONSE);
