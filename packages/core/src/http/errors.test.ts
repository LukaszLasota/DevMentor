import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  isAppError,
  isTooManyRequestsError,
  isValidationError,
  ValidationError,
} from './errors';

describe('error hierarchy', () => {
  it.each([
    [new ValidationError(), 400, 'VALIDATION_ERROR', 'Invalid request.'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED', 'Authentication required.'],
    [new ForbiddenError(), 403, 'FORBIDDEN', 'Access denied.'],
    [new NotFoundError(), 404, 'NOT_FOUND', 'Resource not found.'],
    [new ConflictError(), 409, 'CONFLICT', 'Resource conflict.'],
    [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE', 'Service unavailable.'],
    [new ConflictError('Taken.', { code: 'SLOT_TAKEN' }), 409, 'SLOT_TAKEN', 'Taken.'],
    [new ServiceUnavailableError('Off.', { code: 'PAYMENTS_UNAVAILABLE' }), 503, 'PAYMENTS_UNAVAILABLE', 'Off.'],
    [new TooManyRequestsError(1), 429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again later.'],
  ])('%o maps to %i %s with a default message', (error, status, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status, code, message, name: error.constructor.name });
  });

  it('keeps custom messages, field errors and the cause', () => {
    const cause = new Error('root');
    const error = new ValidationError('Bad email.', { email: ['Invalid'] }, { cause });

    expect(error.message).toBe('Bad email.');
    expect(error.fieldErrors).toEqual({ email: ['Invalid'] });
    expect(error.cause).toBe(cause);
  });

  it('gives TooManyRequestsError a Retry-After header and keeps a custom message and cause', () => {
    const cause = new Error('limit');
    const error = new TooManyRequestsError(42, 'Slow down.', { cause });

    expect(error.retryAfterSeconds).toBe(42);
    expect(error.headers).toEqual({ 'Retry-After': '42' });
    expect(error.message).toBe('Slow down.');
    expect(error.cause).toBe(cause);
    expect(new NotFoundError().headers).toBeUndefined();
  });

  it('recognises a TooManyRequestsError only with its code and a numeric retryAfterSeconds', () => {
    const brand = Symbol.for('devmentor.app-error');

    expect(isTooManyRequestsError(new TooManyRequestsError(5))).toBe(true);
    expect(isTooManyRequestsError(new NotFoundError())).toBe(false);
    expect(isTooManyRequestsError({ [brand]: true, status: 429, code: 'TOO_MANY_REQUESTS', message: 'x' })).toBe(false);
    expect(isTooManyRequestsError(null)).toBe(false);
  });

  it('defaults ValidationError field errors to an empty object', () => {
    expect(new ValidationError().fieldErrors).toEqual({});
  });
});

describe('isAppError / isValidationError', () => {
  const brand = Symbol.for('devmentor.app-error');

  it('recognises every AppError and only a ValidationError as a validation error', () => {
    expect(isAppError(new AppError(418, 'TEAPOT', 'Short and stout.'))).toBe(true);
    expect(isAppError(new NotFoundError())).toBe(true);
    expect(isValidationError(new ValidationError())).toBe(true);
    expect(isValidationError(new NotFoundError())).toBe(false);
  });

  it('recognises a branded error from a class it does not know (another bundle)', () => {
    class ForeignError extends Error {
      readonly [brand] = true;
      readonly status = 400;
      readonly code = 'VALIDATION_ERROR';
      readonly fieldErrors = { email: ['Invalid'] };
    }
    const foreign = new ForeignError('Bad email.');

    expect(foreign).not.toBeInstanceOf(AppError);
    expect(isAppError(foreign)).toBe(true);
    expect(isValidationError(foreign)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'NOT_FOUND'],
    ['a plain Error', new Error('x')],
    ['an unbranded look-alike', { status: 404, code: 'NOT_FOUND', message: 'x' }],
    ['a brand set to something else', { [brand]: 'yes', status: 404, code: 'NOT_FOUND', message: 'x' }],
    ['a non-numeric status', { [brand]: true, status: '404', code: 'NOT_FOUND', message: 'x' }],
    ['a non-string code', { [brand]: true, status: 404, code: 404, message: 'x' }],
    ['a missing message', { [brand]: true, status: 404, code: 'NOT_FOUND' }],
  ])('rejects %s', (_label, value) => {
    expect(isAppError(value)).toBe(false);
    expect(isValidationError(value)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['not an object', 'email'],
  ])('rejects a VALIDATION_ERROR whose fieldErrors are %s', (_label, fieldErrors) => {
    const value = { [brand]: true, status: 400, code: 'VALIDATION_ERROR', message: 'x', fieldErrors };

    expect(isAppError(value)).toBe(true);
    expect(isValidationError(value)).toBe(false);
  });
});
