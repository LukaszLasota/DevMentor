import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { mentorListQuerySchema, UNKNOWN_TAG_MESSAGE } from './mentor-list-query.schema';

const errors = (input: unknown) => {
  const result = mentorListQuerySchema.safeParse(input);

  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};

describe('mentorListQuerySchema', () => {
  it.each(['typescript', 'react', 'python', 'ai-agents'])('accepts the key %s', (tag) => {
    expect(mentorListQuerySchema.parse({ tag })).toEqual({ tag });
  });

  it('accepts no tag (everyone) and drops unknown parameters', () => {
    expect(mentorListQuerySchema.parse({})).toEqual({});
    expect(mentorListQuerySchema.parse({ sort: 'rating' })).toEqual({});
  });

  it.each([
    ['empty', ''],
    ['wrong case', 'REACT'],
    ['a label', 'AI agents'],
    ['unknown', 'rust'],
    ['repeated', ['react', 'python']],
  ])('refuses a tag that is %s, naming tag', (_case, tag) => {
    expect(errors({ tag })).toEqual({ tag: [UNKNOWN_TAG_MESSAGE] });
  });
});
