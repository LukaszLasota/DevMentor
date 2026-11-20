import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  BIO_MESSAGE,
  DISPLAY_NAME_MESSAGE,
  isPublicWorkUrl,
  mentorProfileUpdateSchema,
  PUBLIC_WORK_URL_MESSAGE,
  STACK_TAG_MESSAGE,
  STACK_TAGS_MAX_MESSAGE,
} from './mentor-profile-update.schema';

const parse = (input: unknown) => mentorProfileUpdateSchema.safeParse(input);
const fieldErrors = (input: unknown) => {
  const result = parse(input);

  return result.success ? {} : z.flattenError(result.error).fieldErrors;
};

describe('mentorProfileUpdateSchema', () => {
  it('accepts an empty body: every field is optional (omitted = unchanged)', () => {
    expect(parse({})).toEqual({ success: true, data: {} });
  });

  it('trims text and keeps a complete page', () => {
    expect(
      parse({
        displayName: '  Ada Lovelace ',
        publicWorkUrl: ' https://github.com/ada/engine ',
        bio: ' Built the first program. ',
        stackTags: ['python', 'typescript'],
      }).data,
    ).toEqual({
      displayName: 'Ada Lovelace',
      publicWorkUrl: 'https://github.com/ada/engine',
      bio: 'Built the first program.',
      stackTags: ['typescript', 'python'],
    });
  });

  it('clears a field with an empty or blank string', () => {
    expect(parse({ displayName: '', publicWorkUrl: '   ', bio: '', stackTags: [] }).data).toEqual({
      displayName: null,
      publicWorkUrl: null,
      bio: null,
      stackTags: [],
    });
  });

  it('drops keys the schema does not know (no mass assignment)', () => {
    expect(parse({ slug: 'admin', publishedAt: '2026-01-01', userId: 'x' }).data).toEqual({});
  });

  it('limits the display name to 80 characters', () => {
    expect(parse({ displayName: 'a'.repeat(80) }).success).toBe(true);
    expect(fieldErrors({ displayName: 'a'.repeat(81) })).toEqual({ displayName: [DISPLAY_NAME_MESSAGE] });
  });

  it('limits the bio to 2000 characters', () => {
    expect(parse({ bio: 'a'.repeat(2000) }).success).toBe(true);
    expect(fieldErrors({ bio: 'a'.repeat(2001) })).toEqual({ bio: [BIO_MESSAGE] });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:pass@example.com',
    'https://user@example.com',
    'ftp://example.com/file',
    'example.com/repo',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('refuses the public-work link %s with one message', (url) => {
    expect(fieldErrors({ publicWorkUrl: url })).toEqual({ publicWorkUrl: [PUBLIC_WORK_URL_MESSAGE] });
  });

  it('accepts http and https links up to 2048 characters', () => {
    expect(isPublicWorkUrl('http://example.com')).toBe(true);
    expect(isPublicWorkUrl(`https://example.com/${'a'.repeat(2028)}`)).toBe(true);
    expect(isPublicWorkUrl('https://')).toBe(false);
  });

  it('accepts only the four stack tags, at most four, deduplicated in vocabulary order', () => {
    expect(parse({ stackTags: ['ai-agents', 'react', 'react'] }).data).toEqual({ stackTags: ['react', 'ai-agents'] });
    expect(fieldErrors({ stackTags: ['react', 'rust'] })).toEqual({ stackTags: [STACK_TAG_MESSAGE] });
    expect(fieldErrors({ stackTags: ['react', 'react', 'react', 'react', 'react'] })).toEqual({
      stackTags: [STACK_TAGS_MAX_MESSAGE],
    });
  });

  it('refuses a null instead of an empty string', () => {
    expect(parse({ displayName: null }).success).toBe(false);
  });
});
