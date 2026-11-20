import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ bookingReportService: { list: mocks.list } }),
}));

const { ReportsPanel } = await import("./ReportsPanel");

beforeEach(() => {
  mocks.list.mockReset();
});

describe("ReportsPanel", () => {
  it("lists each report with the mentee, mentor, booking and message", async () => {
    mocks.list.mockResolvedValue([
      {
        reportId: "r-1",
        bookingId: "b-1",
        bookingStatus: "confirmed",
        message: "The mentor did not show up.",
        createdAt: "2026-06-24T09:00:00.000Z",
        startsAt: "2026-06-23T09:00:00.000Z",
        menteeEmail: "mentee@devmentor.test",
        mentorName: "Ada",
      },
    ]);

    render(await ReportsPanel());

    expect(screen.getByRole("heading", { name: "Reported bookings" })).toBeTruthy();
    const [, row] = screen.getAllByRole("row");
    expect(within(row as HTMLElement).getByText("mentee@devmentor.test")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Ada")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("b-1 (confirmed)")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("The mentor did not show up.")).toBeTruthy();
  });

  it("says when there are no reports", async () => {
    mocks.list.mockResolvedValue([]);

    render(await ReportsPanel());

    expect(screen.getByText("No reports.")).toBeTruthy();
  });
});
