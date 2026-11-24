import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  invitationCreateSchema,
  STACK_TAG_DUPLICATE_MESSAGE,
  STACK_TAG_REQUIRED_MESSAGE,
  STACK_TAG_UNKNOWN_MESSAGE,
  STACK_TAGS_TOO_MANY_MESSAGE,
} from './invitation-create.schema';

const errorsOf = (input: unknown) => {
  const parsed = invitationCreateSchema.safeParse(input);

  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
};

describe('invitationCreateSchema', () => {
  it('trims and lower-cases the email and keeps the tags', () => {
    expect(invitationCreateSchema.parse({ email: ' Anna@Example.COM ', stackTags: ['react', 'typescript'] })).toEqual({
      email: 'anna@example.com',
      stackTags: ['react', 'typescript'],
    });
  });

  it('parses its own output again (CrudForm posts the parsed values)', () => {
    const once = invitationCreateSchema.parse({ email: 'anna@example.com', stackTags: ['python'] });

    expect(invitationCreateSchema.parse(once)).toEqual(once);
  });

  it.each(['anna', 'anna@', 'anna@example', '   ', `${'a'.repeat(243)}@example.com`])('refuses the email %j with one message', (email) => {
    expect(errorsOf({ email, stackTags: ['react'] }).email).toHaveLength(1);
  });

  it.each([
    [[], STACK_TAG_REQUIRED_MESSAGE],
    [['cobol'], STACK_TAG_UNKNOWN_MESSAGE],
    [['react', 'react'], STACK_TAG_DUPLICATE_MESSAGE],
    [['react', 'typescript', 'python', 'ai-agents', 'react'], STACK_TAGS_TOO_MANY_MESSAGE],
    [undefined, STACK_TAG_REQUIRED_MESSAGE],
  ])('refuses the tags %j with %j', (stackTags, message) => {
    expect(errorsOf({ email: 'anna@example.com', stackTags }).stackTags).toEqual([message]);
  });

  it('refuses unknown fields (no mass assignment)', () => {
    const parsed = invitationCreateSchema.safeParse({ email: 'anna@example.com', stackTags: ['react'], batch: 'b1' });

    expect(parsed.success).toBe(false);
  });
});
