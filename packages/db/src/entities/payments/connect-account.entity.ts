import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { MentorProfileSchema } from '../mentors/mentor-profile.entity';

/** Normalized Stripe Connect state (spec 2026-11-21-mentor-payouts): only `enabled` may receive transfers. */
export const ONBOARDING_STATUSES = ['action_required', 'pending_verification', 'enabled', 'restricted'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_STATUS_CHECK = `onboarding_status in (${ONBOARDING_STATUSES.map((status) => `'${status}'`).join(', ')})`;

/** Named so `ConnectService` re-reads the stored row after losing an insert race. */
export const CONNECT_ACCOUNT_MENTOR_UNIQUE = 'connect_accounts_mentor_profile_id_unique';

/**
 * A mentor's Stripe Express account (one per mentor). Only ids and the normalized status are kept:
 * no Account Link URL, no KYC or bank data. Private to the mentor and the operator.
 */
export const ConnectAccountSchema = defineEntity({
  name: 'ConnectAccount',
  tableName: 'connect_accounts',
  checks: [{ name: 'connect_accounts_onboarding_status_check', expression: ONBOARDING_STATUS_CHECK }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    mentorProfile: () => p.oneToOne(MentorProfileSchema).owner().ref().deleteRule('restrict'),
    providerAccountId: p.text().unique(),
    onboardingStatus: p.string().$type<OnboardingStatus>().columnType('text'),
    lastReconciledAt: p.datetime(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date()),
  },
});

export class ConnectAccount extends ConnectAccountSchema.class {}

ConnectAccountSchema.setClass(ConnectAccount);
