import { describe, expect, it } from 'vitest';
import type { ConnectAccountSnapshot } from './connect-gateway';
import { onboardingStatusOf } from './connect-status';

const account = (fields: Partial<ConnectAccountSnapshot> = {}): ConnectAccountSnapshot => ({
  id: 'acct_1',
  payoutsEnabled: true,
  detailsSubmitted: true,
  transfers: 'active',
  currentlyDue: [],
  pastDue: [],
  disabledReason: null,
  ...fields,
});

describe('onboardingStatusOf', () => {
  it.each([
    ['enabled when payouts are on and transfers active', {}, 'enabled'],
    ['restricted when Stripe disabled it', { disabledReason: 'requirements.past_due' }, 'restricted'],
    ['restricted with past-due requirements', { payoutsEnabled: false, pastDue: ['individual.id_number'] }, 'restricted'],
    ['restricted when transfers are inactive', { transfers: 'inactive' as const }, 'restricted'],
    ['action required with currently-due fields', { payoutsEnabled: false, currentlyDue: ['external_account'] }, 'action_required'],
    ['action required before details are submitted', { payoutsEnabled: false, detailsSubmitted: false }, 'action_required'],
    ['pending verification otherwise', { payoutsEnabled: false }, 'pending_verification'],
    ['not enabled while transfers are pending', { transfers: 'pending' as const }, 'pending_verification'],
    ['not enabled without a transfers capability', { transfers: null }, 'pending_verification'],
  ])('%s', (_case, fields, status) => {
    expect(onboardingStatusOf(account(fields))).toBe(status);
  });
});
