import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./ProfileContent", () => ({ ProfileContent: () => <div>profile content</div> }));

describe("MentorProfilePage", () => {
  it("renders the request-time content inside its main region", async () => {
    const { default: MentorProfilePage, metadata } = await import("./page");

    render(<MentorProfilePage />);

    expect(screen.getByRole("main").textContent).toBe("profile content");
    expect(metadata.title).toBe("Your page · DevMentor");
  });
});
