import { apiHandler, receiveStripeWebhook, STRIPE_WEBHOOK_RESPONSE } from '@devmentor/core/http';

export const POST = apiHandler(receiveStripeWebhook, STRIPE_WEBHOOK_RESPONSE);
