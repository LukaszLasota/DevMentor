import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./VerifyEmailForm", () => ({ VerifyEmailForm: () => <div>verify form</div> }));

describe("VerifyEmailPage", () => {
  it("renders the client form with a no-referrer policy", async () => {
    const { default: VerifyEmailPage, metadata } = await import("./page");

    render(<VerifyEmailPage />);

    expect(screen.getByText("verify form")).toBeTruthy();
    expect(metadata).toEqual({ title: "Set your password · DevMentor", referrer: "no-referrer" });
  });
});
