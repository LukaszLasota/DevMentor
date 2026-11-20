import { UniqueConstraintViolationException } from '@mikro-orm/postgresql';

/**
 * True only for a unique violation (SQLSTATE 23505) on the constraint or index named `constraintName`,
 * so services map exactly their own race to 409 and let every other database error propagate. The
 * driver error's own `constraint` property is copied onto MikroORM's exception.
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    error instanceof UniqueConstraintViolationException &&
    (error as { constraint?: string }).constraint === constraintName
  );
}
