import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./SlotsContent", () => ({ SlotsContent: () => <div>slots content</div> }));

describe("MentorSlotsPage", () => {
  it("renders the request-time content inside its main region", async () => {
    const { default: MentorSlotsPage, metadata } = await import("./page");

    render(<MentorSlotsPage />);

    expect(screen.getByRole("main").textContent).toBe("slots content");
    expect(metadata.title).toBe("Open times · DevMentor");
  });
});
