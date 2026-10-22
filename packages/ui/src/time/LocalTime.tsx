"use client";

import { useSyncExternalStore } from "react";

export interface LocalTimeProps {
  /** ISO 8601 instant (UTC). */
  iso: string;
  /** "datetime" (default): "Thu 14 Nov, 18:30"; "date": "Thu 14 Nov". */
  format?: "datetime" | "date";
}

const OPTIONS: Record<NonNullable<LocalTimeProps["format"]>, Intl.DateTimeFormatOptions> = {
  datetime: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  date: { weekday: "short", day: "numeric", month: "short" },
};

export function formatInstant(iso: string, format: NonNullable<LocalTimeProps["format"]>, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { ...OPTIONS[format], timeZone }).format(new Date(iso)).replace(" at ", ", ");
}

const noSubscription = () => () => {};
const isClient = () => true;
const isServer = () => false;

/**
 * An instant shown in the viewer's time zone (spec #22). Server and first render print UTC with a
 * "UTC" label, so output never differs between server and client; after mount it switches to local
 * time. Without JavaScript the UTC label stays (spec #28).
 */
export function LocalTime({ iso, format = "datetime" }: LocalTimeProps) {
  const hydrated = useSyncExternalStore(noSubscription, isClient, isServer);

  return (
    <time dateTime={iso} className="font-mono tabular-nums">
      {hydrated ? formatInstant(iso, format) : `${formatInstant(iso, format, "UTC")} UTC`}
    </time>
  );
}
