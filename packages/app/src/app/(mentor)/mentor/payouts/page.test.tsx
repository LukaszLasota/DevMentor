import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./PayoutsContent", () => ({ PayoutsContent: () => <p>payouts</p> }));

const { default: MentorPayoutsPage, metadata } = await import("./page");

describe("/mentor/payouts page", () => {
  it("renders its content with a title", () => {
    render(<MentorPayoutsPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByText("payouts")).toBeTruthy();
    expect(metadata.title).toBe("Payouts · DevMentor");
  });
});
