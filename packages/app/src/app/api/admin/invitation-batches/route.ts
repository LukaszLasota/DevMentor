import {
  apiHandler,
  getInvitationBatches,
  INVITATION_BATCHES_RESPONSE,
  INVITATION_CREATED_RESPONSE,
  openInvitationBatch,
} from '@devmentor/core/http';

export const GET = apiHandler(getInvitationBatches, INVITATION_BATCHES_RESPONSE);
export const POST = apiHandler(openInvitationBatch, INVITATION_CREATED_RESPONSE);
