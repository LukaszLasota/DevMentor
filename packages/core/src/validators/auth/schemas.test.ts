import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { registerSchema, resendVerificationSchema } from './account-register.schema';
import { signInSchema } from './account-sign-in.schema';
import { setPasswordSchema } from './password-set.schema';

function fieldErrors(schema: z.ZodObject, value: unknown): Record<string, string[] | undefined> {
  const result = schema.safeParse(value);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('registerSchema', () => {
  it('parses { email } and normalizes it', () => {
    expect(registerSchema.parse({ email: ' Mentee@Example.com ' })).toEqual({ email: 'mentee@example.com' });
  });

  it('drops unknown keys such as a password (set only from the mailed link)', () => {
    expect(registerSchema.parse({ email: 'a@example.com', password: 'x'.repeat(12) })).toEqual({
      email: 'a@example.com',
    });
  });

  it('reports field errors under the field name (CrudForm shape)', () => {
    expect(fieldErrors(registerSchema, { email: '' })).toEqual({ email: ['Enter your email.'] });
    expect(fieldErrors(registerSchema, {})).toEqual({ email: ['Enter your email.'] });
  });

  it('is reused for resend', () => {
    expect(resendVerificationSchema).toBe(registerSchema);
  });
});

describe('signInSchema', () => {
  it('parses { email, password }', () => {
    expect(signInSchema.parse({ email: 'A@Example.com', password: 'short' })).toEqual({
      email: 'a@example.com',
      password: 'short',
    });
  });

  it('reports both fields', () => {
    expect(fieldErrors(signInSchema, { email: '', password: '' })).toEqual({
      email: ['Enter your email.'],
      password: ['Enter your password.'],
    });
  });
});

describe('setPasswordSchema', () => {
  it('parses { token, password } without trimming the password', () => {
    expect(setPasswordSchema.parse({ token: 'abc_DEF-123', password: ' twelve chars ' })).toEqual({
      token: 'abc_DEF-123',
      password: ' twelve chars ',
    });
  });

  it('reports both fields', () => {
    expect(fieldErrors(setPasswordSchema, { token: '', password: 'short' })).toEqual({
      token: ['This link is invalid.'],
      password: ['Password must be at least 12 characters.'],
    });
  });
});
