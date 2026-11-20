// Local wall-clock ⇄ UTC for the CrudForm `datetime` field (spec 2026-10-21-availability-slots): a
// mentor types a time in their own zone; the API stores the UTC instant. Pure, zone passed in, so the
// DST behaviour is unit-tested with fixed zones.

const MINUTE_MS = 60_000;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type LocalToUtc =
  | { kind: "ok"; iso: string; offsetMinutes: number }
  /** The local time is skipped by a clock change (spring forward). */
  | { kind: "gap" }
  | { kind: "invalid" };

/** The viewer's IANA zone (e.g. "Europe/Warsaw"). */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** `YYYY-MM-DDTHH:mm` wall clock of `instant` in `timeZone`. */
export function wallClock(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Minutes the zone is ahead of UTC at `instant` (+120 for Warsaw in summer). */
export function offsetAt(instant: Date, timeZone: string): number {
  const asUtc = Date.parse(`${wallClock(instant, timeZone)}:00Z`);

  return Math.round((asUtc - Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

/** `+02:00` / `-05:30`. */
export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);

  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * The UTC instant of a local wall-clock time. Offsets are sampled a day either side, so a clock change
 * in between is seen: no candidate maps back to the input → `gap`; two do (fall back) → the earlier.
 */
export function localToUtc(local: string, timeZone: string): LocalToUtc {
  const match = LOCAL.exec(local);

  if (!match) {
    return { kind: "invalid" };
  }

  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);

  if (new Date(guess).toISOString().slice(0, 16) !== local) {
    return { kind: "invalid" };
  }

  const offsets = new Set([offsetAt(new Date(guess - 86_400_000), timeZone), offsetAt(new Date(guess + 86_400_000), timeZone)]);
  const candidates = [...offsets]
    .map((offset) => ({ instant: guess - offset * MINUTE_MS, offset }))
    .filter(({ instant }) => wallClock(new Date(instant), timeZone) === local)
    .sort((a, b) => a.instant - b.instant);
  const earliest = candidates[0];

  return earliest === undefined
    ? { kind: "gap" }
    : { kind: "ok", iso: new Date(earliest.instant).toISOString(), offsetMinutes: earliest.offset };
}

/** The local wall clock of a UTC ISO instant, for an input's value; `""` when there is none. */
export function utcToLocal(iso: string, timeZone: string): string {
  const instant = new Date(iso);

  return iso === "" || Number.isNaN(instant.getTime()) ? "" : wallClock(instant, timeZone);
}

/** "= 16:00 UTC, Mon 22 Jun" — the resolved instant, echoed before submit. */
export function utcEcho(iso: string): string {
  const instant = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(instant);

  return `= ${time} UTC, ${date}`;
}
