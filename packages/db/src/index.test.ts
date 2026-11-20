import { describe, expect, it } from 'vitest';

describe('@devmentor/db public entry', () => {
  it('exposes getOrm, the entities and the ORM values core needs at runtime (exception, lock mode) (ORM types are type-only re-exports)', async () => {
    expect(Object.keys(await import('./index')).sort()).toEqual([
      'DEFAULT_ROLES',
      'EMAIL_VERIFICATION_TTL_MS',
      'EmailVerificationToken',
      'Invitation',
      'LockMode',
      'MENTOR_PROFILE_SLUG_KEY',
      'MentorProfile',
      'ROLES',
      'STACK_TAGS',
      'UniqueConstraintViolationException',
      'User',
      'getOrm',
    ]);
  });
});
