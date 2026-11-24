import { apiHandler, createInvitation, INVITATION_CREATED_RESPONSE } from '@devmentor/core/http';

export const POST = apiHandler(createInvitation, INVITATION_CREATED_RESPONSE);
