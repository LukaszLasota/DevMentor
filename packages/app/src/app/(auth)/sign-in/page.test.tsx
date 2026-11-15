import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./SignInContent", () => ({ SignInContent: () => <div>sign-in content</div> }));

describe("SignInPage", () => {
  it("renders the request-time content inside Suspense", async () => {
    const { default: SignInPage, metadata } = await import("./page");

    render(<SignInPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByText("sign-in content")).toBeTruthy();
    expect(metadata.title).toBe("Sign in · DevMentor");
  });
});
