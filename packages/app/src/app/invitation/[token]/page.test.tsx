import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./InvitationContent", () => ({ InvitationContent: () => <div>invitation content</div> }));

describe("InvitationPage", () => {
  it("renders the request-time content; no referrer, not indexed", async () => {
    const { default: InvitationPage, metadata } = await import("./page");

    render(<InvitationPage params={Promise.resolve({ token: "t" })} searchParams={Promise.resolve({})} />);

    expect(screen.getByText("invitation content")).toBeTruthy();
    expect(metadata).toEqual({
      title: "Mentor invitation · DevMentor",
      referrer: "no-referrer",
      robots: { index: false, follow: false },
    });
  });
});
