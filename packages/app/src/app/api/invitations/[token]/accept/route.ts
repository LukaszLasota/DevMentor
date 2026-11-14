import { acceptInvitation, apiHandler, INVITATION_RESPONSE } from '@devmentor/core/http';

export const POST = apiHandler(acceptInvitation, INVITATION_RESPONSE);
