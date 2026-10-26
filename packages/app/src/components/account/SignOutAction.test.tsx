import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

const { SignOutAction } = await import("./SignOutAction");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SignOutAction", () => {
  it("signs out and goes to /sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: null }))));

    render(<SignOutAction />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.replace).toHaveBeenCalledWith("/sign-in");
  });
});
