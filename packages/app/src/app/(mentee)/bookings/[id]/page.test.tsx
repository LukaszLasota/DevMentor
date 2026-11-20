import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./BookingContent", () => ({ BookingContent: () => <p>booking-content</p> }));

const { default: BookingPage, metadata } = await import("./page");

describe("/bookings/[id] page", () => {
  it("is never indexed and renders the content inside Suspense", () => {
    expect(metadata).toMatchObject({ title: "Your booking · DevMentor", robots: { index: false, follow: false } });

    render(<BookingPage params={Promise.resolve({ id: "x" })} searchParams={Promise.resolve({})} />);

    expect(screen.getByText("booking-content")).toBeTruthy();
  });
});
