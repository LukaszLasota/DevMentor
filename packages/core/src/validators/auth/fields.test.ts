import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RETURN_TO_MAX_LENGTH,
  TOKEN_MAX_LENGTH,
  currentPasswordField,
  emailField,
  linkTokenField,
  newPasswordField,
  returnToField,
} from './fields';

function messages(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('emailField', () => {
  it('trims and lower-cases the address', () => {
    expect(emailField.parse('  Ada.Lovelace@Example.COM \n')).toBe('ada.lovelace@example.com');
  });

  it('asks for an email when it is empty or only whitespace', () => {
    expect(messages(emailField, '')).toEqual(['Enter your email.']);
    expect(messages(emailField, '   ')).toEqual(['Enter your email.']);
  });

  it('rejects a value that is not a string', () => {
    expect(messages(emailField, undefined)).toEqual(['Enter your email.']);
  });

  it('rejects an invalid address with an example', () => {
    expect(messages(emailField, 'not-an-email')).toEqual(['Enter a valid email address, e.g. name@example.com.']);
  });

  it('accepts the maximum length and rejects one character more', () => {
    const local = 'a'.repeat(64);
    const domain = (length: number) => `${'b'.repeat(length - local.length - 1 - '.com'.length)}.com`;
    const atLimit = `${local}@${domain(EMAIL_MAX_LENGTH)}`;
    expect(atLimit).toHaveLength(EMAIL_MAX_LENGTH);
    // The 254-character limit is checked before the format, so the label-length rule does not hide it.
    expect(messages(emailField, `${atLimit}x`)).toEqual([`Email must be at most ${EMAIL_MAX_LENGTH} characters.`]);
    expect(emailField.safeParse('a@example.com').success).toBe(true);
  });

  it('applies the length limit after trimming', () => {
    const atLimit = `${'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length)}@example.com`;
    expect(messages(emailField, `  ${atLimit}  `)).not.toContain(`Email must be at most ${EMAIL_MAX_LENGTH} characters.`);
  });
});

describe('newPasswordField', () => {
  it('accepts 12 and 128 characters', () => {
    expect(newPasswordField.parse('a'.repeat(PASSWORD_MIN_LENGTH))).toHaveLength(12);
    expect(newPasswordField.parse('a'.repeat(PASSWORD_MAX_LENGTH))).toHaveLength(128);
  });

  it('rejects 11 and 129 characters', () => {
    expect(messages(newPasswordField, 'a'.repeat(11))).toEqual(['Password must be at least 12 characters.']);
    expect(messages(newPasswordField, 'a'.repeat(129))).toEqual(['Password must be at most 128 characters.']);
  });

  it('never trims: surrounding spaces count and are kept', () => {
    expect(newPasswordField.parse('  ten chars ')).toBe('  ten chars ');
    expect(messages(newPasswordField, ' '.repeat(11))).toEqual(['Password must be at least 12 characters.']);
  });

  it('has no composition rules', () => {
    expect(newPasswordField.safeParse('aaaaaaaaaaaa').success).toBe(true);
  });

  it('rejects a value that is not a string', () => {
    expect(messages(newPasswordField, 42)).toEqual(['Enter a password.']);
  });
});

describe('currentPasswordField', () => {
  it('accepts any non-empty password up to 128 characters, untrimmed', () => {
    expect(currentPasswordField.parse(' short ')).toBe(' short ');
    expect(currentPasswordField.safeParse('a'.repeat(PASSWORD_MAX_LENGTH)).success).toBe(true);
  });

  it('asks for the password when empty and rejects oversized input', () => {
    expect(messages(currentPasswordField, '')).toEqual(['Enter your password.']);
    expect(messages(currentPasswordField, undefined)).toEqual(['Enter your password.']);
    expect(messages(currentPasswordField, 'a'.repeat(129))).toEqual(['Password must be at most 128 characters.']);
  });
});

describe('linkTokenField', () => {
  it('accepts a base64url token', () => {
    expect(linkTokenField.parse('Ab-_09xyz')).toBe('Ab-_09xyz');
  });

  it('rejects empty, oversized, non-base64url and non-string input with one plain message', () => {
    for (const value of ['', 'a'.repeat(TOKEN_MAX_LENGTH + 1), 'abc+/=', 'has space', null]) {
      expect(messages(linkTokenField, value)).toEqual(['This link is invalid.']);
    }
    expect(linkTokenField.safeParse('a'.repeat(TOKEN_MAX_LENGTH)).success).toBe(true);
  });
});

describe('returnToField', () => {
  it('keeps a string up to the limit as is (the server checks it with safeReturnTo)', () => {
    expect(returnToField.parse('/invitations/abc?x=1')).toBe('/invitations/abc?x=1');
    expect(returnToField.parse('a'.repeat(RETURN_TO_MAX_LENGTH))).toHaveLength(RETURN_TO_MAX_LENGTH);
  });

  it('turns a missing, non-string or oversized value into undefined, never a field error', () => {
    for (const value of [undefined, null, 42, 'a'.repeat(RETURN_TO_MAX_LENGTH + 1)]) {
      expect(returnToField.safeParse(value)).toEqual({ success: true, data: undefined });
    }
  });
});
