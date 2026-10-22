"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Textarea } from "../../components/ui/textarea";
import { FORM_ERRORS_KEY, type ApiResult, type FieldErrors } from "../api/types";
import { Field } from "./Field";

export type CrudFormFieldType = "text" | "email" | "password" | "number" | "textarea" | "checkbox" | "multiselect";

export interface CrudFormOption {
  value: string;
  label: string;
}

export interface CrudFormField<Name extends string> {
  name: Name;
  label: string;
  type?: CrudFormFieldType;
  /** An example, never the name of the field (lesson 06). */
  placeholder?: string;
  /** Hint under the label: format, bounds, example. */
  description?: string;
  /** Mobile keyboard for text fields, e.g. "decimal" for prices (spec #24). */
  inputMode?: "text" | "decimal" | "numeric" | "email" | "url";
  /** Text after the input, e.g. the currency (spec #24). */
  suffix?: string;
  /** Options of a "multiselect" checkbox group (spec #23, stack tags). */
  options?: CrudFormOption[];
  required?: boolean;
}

type FieldValue = string | boolean | string[];
type DefaultValue = string | number | boolean | string[];

export interface CrudFormProps<S extends z.ZodObject> {
  /** The same Zod schema the API route validates with (from @devmentor/core validators). */
  schema: S;
  fields: CrudFormField<keyof z.output<S> & string>[];
  defaultValues?: Partial<Record<keyof z.output<S> & string, DefaultValue>>;
  /** Usually `(values) => apiCall("/api/...", { method: "POST", body: values })`. */
  onSubmit: (values: z.output<S>) => Promise<ApiResult<unknown>>;
  onSuccess?: (data: unknown) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}

function initialValue(type: CrudFormFieldType, value: DefaultValue | undefined): FieldValue {
  if (type === "checkbox") {
    return value === true;
  }

  if (type === "multiselect") {
    return Array.isArray(value) ? value : [];
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
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.name, initialValue(field.type ?? "text", defaultValues[field.name])]),
    ),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setValue = (name: string, value: FieldValue) => setValues((current) => ({ ...current, [name]: value }));

  // After a failed submit, focus moves to the first field with an error (lesson 06 form pattern).
  // Runs after render, when the field is already marked invalid.
  const [focusRequest, setFocusRequest] = useState<{ name: string } | null>(null);
  useEffect(() => {
    if (focusRequest) {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-field="${focusRequest.name}"] :is(input, textarea, button)`)
        ?.focus();
    }
  }, [focusRequest]);

  function focusFirstError(errors: FieldErrors) {
    const first = fields.find((field) => (errors[field.name] ?? []).length > 0);
    setFocusRequest(first ? { name: first.name } : null);
  }

  /** Validates one field when the user leaves it; other fields keep their current errors. */
  function validateField(name: string) {
    const parsed = schema.safeParse(toSchemaInput(fields, values));
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    setFieldErrors((current) => ({ ...current, [name]: errors[name] ?? [] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const parsed = schema.safeParse(toSchemaInput(fields, values));

    if (!parsed.success) {
      const errors = toFieldErrors(parsed.error);
      setFieldErrors(errors);
      setFormError(null);
      focusFirstError(errors);
      return;
    }

    setIsSubmitting(true);
    const result = await onSubmit(parsed.data);
    setIsSubmitting(false);

    if (!result.ok) {
      const errors = result.error.fieldErrors ?? {};
      setFieldErrors(errors);
      setFormError(result.error.message);
      focusFirstError(errors);
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
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      aria-busy={isSubmitting || undefined}
      className="flex min-w-0 flex-col gap-paragraph"
    >
      {formError || rootErrors.length > 0 ? (
        <Alert tone="danger">
          <AlertDescription>{[formError, ...rootErrors].filter(Boolean).join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      {fields.map((field) => {
        const type = field.type ?? "text";
        const errors = fieldErrors[field.name] ?? [];
        const error = errors.length > 0 ? errors.join(" ") : undefined;
        const value = values[field.name];

        if (type === "multiselect") {
          const selected = value as string[];
          return (
            <fieldset
              key={field.name}
              data-field={field.name}
              aria-describedby={error ? `${field.name}-group-error` : undefined}
              className="flex flex-col gap-related"
            >
              <legend className="pb-related text-label font-medium">{field.label}</legend>
              {field.description ? <p className="text-caption text-muted-foreground">{field.description}</p> : null}
              {(field.options ?? []).map((option) => (
                <Field key={option.value} label={option.label} inline>
                  {(control) => (
                    <Checkbox
                      {...control}
                      aria-invalid={error ? true : undefined}
                      checked={selected.includes(option.value)}
                      onCheckedChange={(checked) =>
                        setValue(
                          field.name,
                          checked === true ? [...selected, option.value] : selected.filter((v) => v !== option.value),
                        )
                      }
                    />
                  )}
                </Field>
              ))}
              {error ? (
                <p id={`${field.name}-group-error`} className="text-caption text-destructive">
                  {error}
                </p>
              ) : null}
            </fieldset>
          );
        }

        return (
          <div key={field.name} data-field={field.name}>
            <Field
              label={field.label}
              hint={field.description}
              error={error}
              required={field.required}
              inline={type === "checkbox"}
            >
              {(control) =>
                type === "checkbox" ? (
                  <Checkbox
                    {...control}
                    checked={value === true}
                    onCheckedChange={(checked) => setValue(field.name, checked === true)}
                  />
                ) : type === "textarea" ? (
                  <Textarea
                    {...control}
                    name={field.name}
                    value={String(value)}
                    placeholder={field.placeholder}
                    onChange={(event) => setValue(field.name, event.target.value)}
                    onBlur={() => validateField(field.name)}
                  />
                ) : (
                  <div className="flex items-center gap-related">
                    <Input
                      {...control}
                      name={field.name}
                      type={type}
                      inputMode={field.inputMode}
                      value={String(value)}
                      placeholder={field.placeholder}
                      className={field.inputMode === "decimal" ? "font-mono tabular-nums" : undefined}
                      onChange={(event) => setValue(field.name, event.target.value)}
                      onBlur={() => validateField(field.name)}
                    />
                    {field.suffix ? <span className="text-body-small text-muted-foreground">{field.suffix}</span> : null}
                  </div>
                )
              }
            </Field>
          </div>
        );
      })}

      {/* R03.4: Cancel first, then the primary action, right-aligned; same order in code and on screen. */}
      <div className="flex flex-wrap justify-end gap-related">
        {onCancel ? (
          <Button type="button" onClick={onCancel} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
        ) : null}
        <Button type="submit" intent="primary" appearance="filled" loading={isSubmitting} loadingLabel="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
