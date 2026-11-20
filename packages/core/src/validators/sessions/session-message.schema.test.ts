import { describe, expect, it } from 'vitest';
import {
  ANSWER_LENGTH_MESSAGE,
  MESSAGE_LENGTH_MESSAGE,
  sessionAnswerSchema,
  sessionMessageSchema,
  sessionReadQuerySchema,
} from './session-message.schema';

const issues = (result: { success: boolean; error?: { issues: { message: string }[] } }) => result.error?.issues.map((issue) => issue.message);

describe('sessionMessageSchema', () => {
  it('trims, keeps inner line breaks and drops anything else', () => {
    expect(sessionMessageSchema.parse({ body: '  line one\nline two  ', authorId: 'x' })).toEqual({ body: 'line one\nline two' });
    expect(sessionMessageSchema.parse({ body: 'x'.repeat(4000) }).body).toHaveLength(4000);
  });

  it.each([{}, { body: '   ' }, { body: 'x'.repeat(4001) }])('refuses %o with one message', (input) => {
    expect(issues(sessionMessageSchema.safeParse(input))).toEqual([MESSAGE_LENGTH_MESSAGE]);
  });
});

describe('sessionAnswerSchema', () => {
  it('accepts 20 to 20000 characters after trimming', () => {
    expect(sessionAnswerSchema.parse({ body: `  ${'a'.repeat(20)}  ` })).toEqual({ body: 'a'.repeat(20) });
  });

  it.each([{}, { body: 'too short' }, { body: 'x'.repeat(20001) }])('refuses %o with one message', (input) => {
    expect(issues(sessionAnswerSchema.safeParse(input))).toEqual([ANSWER_LENGTH_MESSAGE]);
  });
});

describe('sessionReadQuerySchema', () => {
  it('reads an optional non-negative integer cursor', () => {
    expect(sessionReadQuerySchema.parse({})).toEqual({});
    expect(sessionReadQuerySchema.parse({ after: '12' })).toEqual({ after: 12 });
  });

  it.each([{ after: '-1' }, { after: '1.5' }, { after: 'abc' }])('refuses %o', (input) => {
    expect(issues(sessionReadQuerySchema.safeParse(input))).toEqual(['Pass a message sequence number.']);
  });
});
