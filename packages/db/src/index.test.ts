import { describe, expect, it } from 'vitest';

describe('@devmentor/db public entry', () => {
  it('exposes only getOrm at runtime (ORM types are type-only re-exports)', async () => {
    expect(Object.keys(await import('./index'))).toEqual(['getOrm']);
  });
});
