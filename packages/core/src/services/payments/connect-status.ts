import type { OnboardingStatus } from '@devmentor/db';
import type { ConnectAccountSnapshot } from './connect-gateway';

/**
 * Normalizes a connected account (spec 2026-11-21-mentor-payouts): `enabled` only when payouts are
 * enabled, nothing disables the account and the `transfers` capability is active; then `restricted`,
 * `action_required`, `pending_verification` in that order. Unknown states never count as enabled.
 */
export function onboardingStatusOf(account: ConnectAccountSnapshot): OnboardingStatus {
  if (account.payoutsEnabled && account.disabledReason === null && account.transfers === 'active') {
    return 'enabled';
  }

  if (account.disabledReason !== null || account.pastDue.length > 0 || account.transfers === 'inactive') {
    return 'restricted';
  }

  if (account.currentlyDue.length > 0 || !account.detailsSubmitted) {
    return 'action_required';
  }

  return 'pending_verification';
}
