"use client";

import { useSyncExternalStore } from "react";
import { Input } from "../../components/ui/input";
import { localToUtc, formatOffset, utcEcho, viewerTimeZone } from "./datetime";
import { Field } from "./Field";

export interface DateTimeFieldProps {
  label: string;
  name: string;
  /** Local wall clock, `YYYY-MM-DDTHH:mm`. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  /** IANA zone the value is in; the viewer's zone by default (tests pass a fixed one). */
  timeZone?: string;
}

const noSubscription = () => () => {};

/**
 * A start time in the viewer's own zone (spec #25): the zone is named next to the field and the
 * resolved UTC instant is echoed before submit, so a mentor sees what will be stored. The server
 * render names no zone (it cannot know it); the client fills it in after hydration.
 */
export function DateTimeField({ label, name, value, onChange, onBlur, error, required, timeZone }: DateTimeFieldProps) {
  const viewerZone = useSyncExternalStore(noSubscription, viewerTimeZone, () => null);
  const zone = timeZone ?? viewerZone;
  const resolved = zone === null ? null : localToUtc(value, zone);

  return (
    <Field label={label} hint={zone === null ? "Times are in your time zone." : `Times are in ${zone}.`} error={error} required={required}>
      {(control) => (
        <div className="flex flex-col gap-related">
          <Input
            {...control}
            name={name}
            type="datetime-local"
            step={60}
            value={value}
            className="w-fit font-mono tabular-nums"
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          />
          <p role="status" className="font-mono text-caption text-muted-foreground tabular-nums">
            {resolved?.kind === "ok" ? `${utcEcho(resolved.iso)} (UTC${formatOffset(resolved.offsetMinutes)} in ${zone})` : ""}
          </p>
        </div>
      )}
    </Field>
  );
}
