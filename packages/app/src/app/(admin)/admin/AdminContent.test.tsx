import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("./HealthPanel", () => ({ HealthPanel: () => <div>health panel</div> }));

const { AdminContent } = await import("./AdminContent");

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["operator"] });
});

describe("AdminContent", () => {
  it("guards /admin for operators and renders the heading and the health panel", async () => {
    render(await AdminContent({ searchParams: Promise.resolve({}) }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/admin", "operator");
    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("health panel")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says why an operator was sent here from a mentor page (L03)", async () => {
    render(await AdminContent({ searchParams: Promise.resolve({ notice: "mentor_only" }) }));

    expect(screen.getByRole("status").textContent).toBe("This page is for mentors.");
  });

  it("renders nothing when the guard redirects", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT /mentors?notice=operator_only"));

    await expect(AdminContent({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
  });
});
