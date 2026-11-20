import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./PricesContent", () => ({ PricesContent: () => <div>prices content</div> }));

describe("MentorPricesPage", () => {
  it("renders the request-time content inside its main region", async () => {
    const { default: MentorPricesPage, metadata } = await import("./page");

    render(<MentorPricesPage />);

    expect(screen.getByRole("main").textContent).toBe("prices content");
    expect(metadata.title).toBe("Prices · DevMentor");
  });
});
