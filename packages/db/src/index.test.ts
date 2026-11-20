import { describe, expect, it } from 'vitest';

describe('@devmentor/db public entry', () => {
  it('exposes getOrm, the entities and the ORM values core needs at runtime (exception, lock mode) (ORM types are type-only re-exports)', async () => {
    expect(Object.keys(await import('./index')).sort()).toEqual([
      'ACTIVE_BOOKING_SLOT_UNIQUE',
      'ACTIVE_BOOKING_STATUSES',
      'ACTIVE_SLOT_UNIQUE',
      'BOOKING_REPORT_BOOKING_UNIQUE',
      'BOOKING_REPORT_MESSAGE_MAX',
      'BOOKING_REPORT_MESSAGE_MIN',
      'Booking',
      'BookingReport',
      'DEFAULT_ROLES',
      'EMAIL_VERIFICATION_TTL_MS',
      'EmailVerificationToken',
      'Invitation',
      'LockMode',
      'MENTOR_PROFILE_SLUG_KEY',
      'MentorProfile',
      'ROLES',
      'STACK_TAGS',
      'Slot',
      'StripeEvent',
      'UniqueConstraintViolationException',
      'User',
      'getOrm',
      'isUniqueViolation',
    ]);
  });
});
