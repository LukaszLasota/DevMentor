import { describe, expect, it } from 'vitest';

describe('@devmentor/db public entry', () => {
  it('exposes getOrm and the entities core needs at runtime (ORM types are type-only re-exports)', async () => {
    expect(Object.keys(await import('./index')).sort()).toEqual(['ROLES', 'User', 'getOrm']);
  });
});
