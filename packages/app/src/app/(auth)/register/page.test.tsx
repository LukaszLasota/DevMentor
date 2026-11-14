import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./RegisterContent", () => ({ RegisterContent: () => <div>register content</div> }));

describe("RegisterPage", () => {
  it("renders the request-time content inside Suspense", async () => {
    const { default: RegisterPage, metadata } = await import("./page");

    render(<RegisterPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByText("register content")).toBeTruthy();
    expect(metadata.title).toBe("Create an account · DevMentor");
  });
});
