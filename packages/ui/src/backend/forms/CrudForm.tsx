"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { FORM_ERRORS_KEY, type ApiResult, type FieldErrors } from "../api/types";

export type CrudFormFieldType = "text" | "email" | "password" | "number" | "textarea" | "checkbox";

export interface CrudFormField<Name extends string> {
  name: Name;
  label: string;
  type?: CrudFormFieldType;
  placeholder?: string;
  description?: string;
}

type FieldValue = string | boolean;

export interface CrudFormProps<S extends z.ZodObject> {
  /** The same Zod schema the API route validates with (from @devmentor/core validators). */
  schema: S;
  fields: CrudFormField<keyof z.output<S> & string>[];
  defaultValues?: Partial<Record<keyof z.output<S> & string, string | number | boolean>>;
  /** Usually `(values) => apiCall("/api/...", { method: "POST", body: values })`. */
  onSubmit: (values: z.output<S>) => Promise<ApiResult<unknown>>;
  onSuccess?: (data: unknown) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}

function initialValue(type: CrudFormFieldType, value: string | number | boolean | undefined): FieldValue {
  if (type === "checkbox") {
    return value === true;
  }

  return value === undefined ? "" : String(value);
}

/** Converts raw input state to what the schema expects: numbers as numbers, empty number fields as undefined. */
function toSchemaInput(fields: CrudFormField<string>[], values: Record<string, FieldValue>): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const field of fields) {
    const value = values[field.name];
    input[field.name] = field.type === "number" ? (value === "" ? undefined : Number(value)) : value;
  }

  return input;
}

// Mirrors toFieldErrors in @devmentor/core/http (ui must not import core).
function toFieldErrors(error: z.ZodError): FieldErrors {
  const { formErrors, fieldErrors } = z.flattenError(error);
  // flattenError only lists fields that have at least one message.
  const result: FieldErrors = { ...(fieldErrors as FieldErrors) };

  if (formErrors.length > 0) {
    result[FORM_ERRORS_KEY] = formErrors;
  }

  return result;
}

/**
 * Schema-driven create/edit form: client-side validation with the shared schema,
 * server field errors next to their fields, Cmd/Ctrl+Enter submits, Escape cancels.
 */
export function CrudForm<S extends z.ZodObject>({
  schema,
  fields,
  defaultValues = {},
  onSubmit,
  onSuccess,
  onCancel,
  submitLabel = "Save",
  cancelLabel = "Cancel",
}: CrudFormProps<S>) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.name, initialValue(field.type ?? "text", defaultValues[field.name])]),
    ),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setValue = (name: string, value: FieldValue) => setValues((current) => ({ ...current, [name]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const parsed = schema.safeParse(toSchemaInput(fields, values));

    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      setFormError(null);
      return;
    }

    setIsSubmitting(true);
    const result = await onSubmit(parsed.data);
    setIsSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.message);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    onSuccess?.(result.data);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
      return;
    }

    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  const rootErrors = fieldErrors[FORM_ERRORS_KEY] ?? [];

  return (
    <form noValidate onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
      {formError || rootErrors.length > 0 ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {[formError, ...rootErrors].filter(Boolean).join(" ")}
        </div>
      ) : null}

      {fields.map((field) => {
        const type = field.type ?? "text";
        const inputId = `${formId}-${field.name}`;
        const errorId = `${inputId}-error`;
        const errors = fieldErrors[field.name] ?? [];
        const hasError = errors.length > 0;
        const describedBy = hasError ? errorId : undefined;
        const value = values[field.name];

        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            {type === "checkbox" ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={inputId}
                  checked={value === true}
                  onCheckedChange={(checked) => setValue(field.name, checked === true)}
                  aria-invalid={hasError}
                  aria-describedby={describedBy}
                />
                <Label htmlFor={inputId}>{field.label}</Label>
              </div>
            ) : (
              <>
                <Label htmlFor={inputId}>{field.label}</Label>
                {type === "textarea" ? (
                  <Textarea
                    id={inputId}
                    name={field.name}
                    value={String(value)}
                    placeholder={field.placeholder}
                    onChange={(event) => setValue(field.name, event.target.value)}
                    aria-invalid={hasError}
                    aria-describedby={describedBy}
                  />
                ) : (
                  <Input
                    id={inputId}
                    name={field.name}
                    type={type}
                    value={String(value)}
                    placeholder={field.placeholder}
                    onChange={(event) => setValue(field.name, event.target.value)}
                    aria-invalid={hasError}
                    aria-describedby={describedBy}
                  />
                )}
              </>
            )}
            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
            {hasError ? (
              <p id={errorId} className="text-xs text-destructive">
                {errors.join(" ")}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
