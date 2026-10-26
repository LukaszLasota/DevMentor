import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./AdminContent", () => ({ AdminContent: () => <div>admin content</div> }));

describe("AdminPage", () => {
  it("renders the request-time content inside its main region", async () => {
    const { default: AdminPage } = await import("./page");

    render(<AdminPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByRole("main").textContent).toBe("admin content");
  });
});
