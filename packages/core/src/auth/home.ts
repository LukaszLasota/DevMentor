import type { Role } from '@devmentor/db';

/** Where a user lands by default: operator → `/admin`, then mentor → `/mentor`, else `/mentors` (L01). */
export function homeFor(roles: readonly Role[]): string {
  if (roles.includes('operator')) {
    return '/admin';
  }

  if (roles.includes('mentor')) {
    return '/mentor';
  }

  return '/mentors';
}
