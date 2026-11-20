import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./MentorsContent", () => ({ MentorsContent: () => <div>list content</div> }));

describe("MentorsPage", () => {
  it("renders the static heading and order line, then the request-time list; noindex", async () => {
    const { default: MentorsPage, metadata } = await import("./page");

    render(<MentorsPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByRole("heading", { level: 1, name: "Find a mentor" })).toBeTruthy();
    expect(screen.getByText("Mentors who most recently published open times come first.")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("list content");
    expect(metadata.title).toBe("Find a mentor · DevMentor");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
