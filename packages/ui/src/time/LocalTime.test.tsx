import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatInstant, LocalTime } from "./LocalTime";

describe("LocalTime long-date", () => {
  it("prints day, month name and year, and leaves the other formats unchanged", () => {
    expect(formatInstant("2026-11-24T10:00:00Z", "long-date", "UTC")).toBe("24 November 2026");
    expect(formatInstant("2026-11-14T18:30:00Z", "date", "UTC")).toBe("Sat 14 Nov");
    expect(formatInstant("2026-11-14T18:30:00Z", "datetime", "UTC")).toBe("Sat 14 Nov, 18:30");
  });

  it("renders the long date in the viewer's zone after mount", () => {
    render(<LocalTime iso="2026-12-08T14:05:00Z" format="long-date" />);

    expect(screen.getByText(formatInstant("2026-12-08T14:05:00Z", "long-date")).getAttribute("dateTime")).toBe("2026-12-08T14:05:00Z");
  });
});
