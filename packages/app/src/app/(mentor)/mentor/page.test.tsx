import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MentorContent", () => ({ MentorContent: () => <div>mentor content</div> }));

describe("MentorPage", () => {
  it("renders the request-time content inside its main region", async () => {
    const { default: MentorPage, metadata } = await import("./page");

    render(<MentorPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByRole("main").textContent).toBe("mentor content");
    expect(metadata.title).toBe("Your mentor page · DevMentor");
  });
});
