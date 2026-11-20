import { CheckConstraintViolationException, UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './errors';

const driverError = (constraint: string) => Object.assign(new Error('violation'), { code: '23505', constraint });

describe('isUniqueViolation', () => {
  it('is true only for a unique violation on the named constraint', () => {
    expect(isUniqueViolation(new UniqueConstraintViolationException(driverError('a_uq')), 'a_uq')).toBe(true);
  });

  it.each([
    ['another unique constraint', new UniqueConstraintViolationException(driverError('other_uq'))],
    ['a check violation with the same name', new CheckConstraintViolationException(driverError('a_uq'))],
    ['a plain error', new Error('a_uq')],
    ['a non-error', 'a_uq'],
  ])('is false for %s', (_case, error) => {
    expect(isUniqueViolation(error, 'a_uq')).toBe(false);
  });
});
