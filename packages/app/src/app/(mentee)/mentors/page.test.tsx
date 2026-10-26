import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MentorsContent", () => ({ MentorsContent: () => <div>mentors content</div> }));

describe("MentorsPage", () => {
  it("renders the request-time content inside its main region", async () => {
    const { default: MentorsPage, metadata } = await import("./page");

    render(<MentorsPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByRole("main").textContent).toBe("mentors content");
    expect(metadata.title).toBe("Mentors · DevMentor");
  });
});
