import { z } from 'zod';
import { ValidationError, type FieldErrors } from './errors';

const FORM_ERRORS_KEY = '_root';

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const { formErrors, fieldErrors } = z.flattenError(error);
  const result: FieldErrors = {};

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) {
      result[field] = messages;
    }
  }

  if (formErrors.length > 0) {
    result[FORM_ERRORS_KEY] = formErrors;
  }

  return result;
}

/** Parses input with a schema; throws `ValidationError` with per-field messages on failure. */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ValidationError('Invalid request.', toFieldErrors(result.error), { cause: result.error });
  }

  return result.data;
}

export async function parseJsonBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;

  try {
    body = await req.json();
  } catch (error) {
    throw new ValidationError('Request body must be valid JSON.', {}, { cause: error });
  }

  return parseWith(schema, body);
}

export function parseSearchParams<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  return parseWith(schema, Object.fromEntries(new URL(req.url).searchParams));
}
