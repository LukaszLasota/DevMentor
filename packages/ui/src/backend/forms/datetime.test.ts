import { describe, expect, it } from "vitest";
import { formatOffset, localToUtc, offsetAt, utcEcho, utcToLocal, viewerTimeZone, wallClock } from "./datetime";

const WARSAW = "Europe/Warsaw";

describe("localToUtc", () => {
  it("converts Warsaw summer (CEST, UTC+2) and winter (CET, UTC+1)", () => {
    expect(localToUtc("2026-06-22T18:00", WARSAW)).toEqual({ kind: "ok", iso: "2026-06-22T16:00:00.000Z", offsetMinutes: 120 });
    expect(localToUtc("2026-12-07T18:00", WARSAW)).toEqual({ kind: "ok", iso: "2026-12-07T17:00:00.000Z", offsetMinutes: 60 });
  });

  it("refuses a local time skipped by the spring-forward change (2027-03-28 02:30 Warsaw)", () => {
    expect(localToUtc("2027-03-28T02:30", WARSAW)).toEqual({ kind: "gap" });
    expect(localToUtc("2027-03-28T03:00", WARSAW)).toEqual({ kind: "ok", iso: "2027-03-28T01:00:00.000Z", offsetMinutes: 120 });
  });

  it("resolves a fall-back overlap to the earlier instant (2026-10-25 02:30 Warsaw → 00:30Z, +02:00)", () => {
    expect(localToUtc("2026-10-25T02:30", WARSAW)).toEqual({ kind: "ok", iso: "2026-10-25T00:30:00.000Z", offsetMinutes: 120 });
  });

  it("works in UTC and west of it", () => {
    expect(localToUtc("2026-06-22T16:00", "UTC")).toMatchObject({ iso: "2026-06-22T16:00:00.000Z", offsetMinutes: 0 });
    expect(localToUtc("2026-06-22T12:00", "America/New_York")).toMatchObject({ iso: "2026-06-22T16:00:00.000Z", offsetMinutes: -240 });
  });

  it.each(["", "2026-06-22", "2026-06-22T18:00:30", "2026-02-30T18:00", "2026-06-22T24:00", "tomorrow"])("is invalid for %j", (local) => {
    expect(localToUtc(local, WARSAW)).toEqual({ kind: "invalid" });
  });
});

describe("datetime helpers", () => {
  it("renders an instant back at the same local time for another viewer", () => {
    expect(utcToLocal("2026-06-22T16:00:00.000Z", WARSAW)).toBe("2026-06-22T18:00");
    expect(utcToLocal("2026-06-22T16:00:00.000Z", "Europe/London")).toBe("2026-06-22T17:00");
    expect(utcToLocal("", WARSAW)).toBe("");
    expect(utcToLocal("not a date", WARSAW)).toBe("");
  });

  it("echoes the UTC instant and formats offsets", () => {
    expect(utcEcho("2026-06-22T16:00:00.000Z")).toBe("= 16:00 UTC, Mon 22 Jun");
    expect([formatOffset(120), formatOffset(-330), formatOffset(0)]).toEqual(["+02:00", "-05:30", "+00:00"]);
  });

  it("reads wall clock, offset and the viewer zone", () => {
    expect(wallClock(new Date("2026-06-22T16:00:00.000Z"), WARSAW)).toBe("2026-06-22T18:00");
    expect(offsetAt(new Date("2026-12-07T17:00:00.000Z"), WARSAW)).toBe(60);
    expect(viewerTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
