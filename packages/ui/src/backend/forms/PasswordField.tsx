"use client";

import { useState } from "react";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Field, type FieldProps } from "./Field";

export interface PasswordFieldProps extends Omit<FieldProps, "children" | "inline"> {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  /** "new-password" when the user chooses one (password managers offer to generate), else "current-password". */
  autoComplete?: string;
}

/**
 * Password input with a "Show password" checkbox under it (DS-02, decision L05: one field, no
 * "repeat password"). The checkbox only switches the input between hidden and plain text; the value
 * stays in the field either way.
 */
export function PasswordField({ value, onChange, onBlur, name, autoComplete = "new-password", ...field }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);

  return (
    <div className="flex flex-col gap-related">
      <Field {...field}>
        {(control) => (
          <Input
            {...control}
            name={name}
            type={shown ? "text" : "password"}
            autoComplete={autoComplete}
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          />
        )}
      </Field>
      <Field label="Show password" inline>
        {(control) => <Checkbox id={control.id} checked={shown} onCheckedChange={(checked) => setShown(checked === true)} />}
      </Field>
    </div>
  );
}
