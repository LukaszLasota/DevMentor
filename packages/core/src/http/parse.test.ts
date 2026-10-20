import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from './errors';
import { parseJsonBody, parseSearchParams, parseWith, toFieldErrors } from './parse';

function captureValidationError(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error('Expected a ValidationError');
}

describe('toFieldErrors', () => {
  it('keeps per-field messages and puts object-level messages under _root', () => {
    const schema = z
      .object({ password: z.string().min(8, 'Too short'), confirm: z.string() })
      .refine((value) => value.password === value.confirm, 'Passwords differ');

    const result = schema.safeParse({ password: 'short', confirm: 'other' });

    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!)).toEqual({ password: ['Too short'], _root: ['Passwords differ'] });

    const mismatch = schema.safeParse({ password: 'long-enough', confirm: 'other' });
    expect(toFieldErrors(mismatch.error!)).toEqual({ _root: ['Passwords differ'] });
  });
});

describe('parseWith', () => {
  it('returns parsed output (unknown keys stripped)', () => {
    expect(parseWith(z.object({ a: z.number() }), { a: 1, b: 2 })).toEqual({ a: 1 });
  });

  it('throws ValidationError with field errors and the ZodError as cause', () => {
    const error = captureValidationError(() => parseWith(z.object({ a: z.number() }), {}));

    expect(Object.keys(error.fieldErrors)).toEqual(['a']);
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });
});

describe('parseJsonBody', () => {
  it('parses a JSON body with the schema', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    await expect(parseJsonBody(req, z.object({ a: z.number() }))).resolves.toEqual({ a: 1 });
  });

  it('rejects malformed JSON as a ValidationError', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: '{' });

    await expect(parseJsonBody(req, z.object({}))).rejects.toThrow('Request body must be valid JSON.');
  });
});

describe('parseSearchParams', () => {
  it('validates query parameters', () => {
    const req = new Request('http://localhost/x?page=2');

    expect(parseSearchParams(req, z.object({ page: z.coerce.number() }))).toEqual({ page: 2 });
  });
});
