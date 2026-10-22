import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { Label } from "../../components/ui/label";

/** Props a Field hands to its control so label, hint and error are announced together. */
export interface FieldControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  required: boolean | undefined;
}

export interface FieldProps {
  label: string;
  /** Example or format help shown under the label; the placeholder is never the name of the field. */
  hint?: string;
  /** Error under the control: what is wrong and what to do ("Enter a price in PLN, for example 120"). */
  error?: string;
  /** Marks the field as required for the browser and assistive tech, and adds "(required)" to the label. */
  required?: boolean;
  /** Adds "(optional)" to the label when most fields of the form are required. */
  optional?: boolean;
  /** Checkbox fields put the control before the label on one row. */
  inline?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label, hint, control and error as one unit, wired with ids and aria attributes. */
export function Field({ label, hint, error, required, optional, inline = false, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required });
  const marker = required ? " (required)" : optional ? " (optional)" : "";
  const labelNode = (
    <Label htmlFor={id}>
      {label}
      {marker ? <span className="font-normal text-muted-foreground">{marker}</span> : null}
    </Label>
  );

  return (
    <div data-slot="field" className={cn("flex flex-col gap-related", className)}>
      {inline ? (
        <div className="flex min-h-6 items-center gap-related">
          {control}
          {labelNode}
        </div>
      ) : (
        <>
          {labelNode}
          {hint ? (
            <p id={hintId} className="text-caption text-muted-foreground">
              {hint}
            </p>
          ) : null}
          {control}
        </>
      )}
      {inline && hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
