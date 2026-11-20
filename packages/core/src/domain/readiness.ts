import { ValidationError } from '../http/errors';

// Client-safe readiness primitive (spec 2026-10-21-mentor-page): requirements are declared once and
// read twice — the service asserts them, the page renders `evaluate()` as a checklist.

export interface Requirement<S, K extends string = string> {
  /** Equals the form field name when the requirement is about one field, so errors land on it. */
  key: K;
  /** Shown next to the field when `assert` refuses. */
  message: string;
  met(subject: S): boolean;
}

export interface RequirementResult<K extends string = string> {
  key: K;
  met: boolean;
}

export interface Readiness<S, K extends string = string> {
  readonly keys: readonly K[];
  /** Plain data, in declaration order. */
  evaluate(subject: S): RequirementResult<K>[];
  isMet(subject: S): boolean;
  /** Throws `ValidationError` with one `fieldErrors` entry per unmet requirement. */
  assert(subject: S, message?: string): void;
}

export const NOT_READY_MESSAGE = 'Some required items are missing.';

export function defineReadiness<S, K extends string>(requirements: readonly Requirement<S, K>[]): Readiness<S, K> {
  const evaluate = (subject: S) => requirements.map((requirement) => ({ key: requirement.key, met: requirement.met(subject) }));

  return {
    keys: requirements.map((requirement) => requirement.key),
    evaluate,
    isMet: (subject) => requirements.every((requirement) => requirement.met(subject)),
    assert: (subject, message = NOT_READY_MESSAGE) => {
      const unmet = requirements.filter((requirement) => !requirement.met(subject));

      if (unmet.length > 0) {
        throw new ValidationError(
          message,
          Object.fromEntries(unmet.map((requirement) => [requirement.key, [requirement.message]])),
        );
      }
    },
  };
}
