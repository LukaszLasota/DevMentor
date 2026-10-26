import { describe, expect, it } from 'vitest';

describe('@devmentor/db public entry', () => {
  it('exposes getOrm, the entities and the ORM exceptions core needs at runtime (ORM types are type-only re-exports)', async () => {
    expect(Object.keys(await import('./index')).sort()).toEqual(['DEFAULT_ROLES', 'ROLES', 'UniqueConstraintViolationException', 'User', 'getOrm']);
  });
});
