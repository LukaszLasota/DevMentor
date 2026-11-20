import { describe, expect, it } from 'vitest';
import { isValidationError } from '../http/errors';
import { defineReadiness, NOT_READY_MESSAGE } from './readiness';

interface Draft {
  name: string | null;
  tags: string[];
}

const ready = defineReadiness<Draft, 'name' | 'tags'>([
  { key: 'name', message: 'Add a name.', met: (draft) => draft.name !== null },
  { key: 'tags', message: 'Pick a tag.', met: (draft) => draft.tags.length > 0 },
]);

function thrown(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe('defineReadiness', () => {
  it('evaluates every requirement in declaration order as plain data', () => {
    expect(ready.keys).toEqual(['name', 'tags']);
    expect(ready.evaluate({ name: 'Ada', tags: [] })).toEqual([
      { key: 'name', met: true },
      { key: 'tags', met: false },
    ]);
  });

  it('passes when all are met', () => {
    const draft = { name: 'Ada', tags: ['react'] };

    expect(ready.isMet(draft)).toBe(true);
    expect(() => ready.assert(draft)).not.toThrow();
  });

  it('refuses with fieldErrors keyed by each unmet requirement', () => {
    const error = thrown(() => ready.assert({ name: null, tags: [] }));

    expect(ready.isMet({ name: null, tags: [] })).toBe(false);
    expect(isValidationError(error)).toBe(true);
    expect(error).toMatchObject({
      message: NOT_READY_MESSAGE,
      fieldErrors: { name: ['Add a name.'], tags: ['Pick a tag.'] },
    });
  });

  it('names only the unmet ones and takes a custom message', () => {
    expect(thrown(() => ready.assert({ name: 'Ada', tags: [] }, 'Not yet.'))).toMatchObject({
      message: 'Not yet.',
      fieldErrors: { tags: ['Pick a tag.'] },
    });
  });
});
