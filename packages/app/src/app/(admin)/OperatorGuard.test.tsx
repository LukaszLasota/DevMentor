import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));

const { OperatorGuard } = await import("./OperatorGuard");

beforeEach(() => {
  mocks.requirePageRole.mockReset();
});

describe("OperatorGuard", () => {
  it("renders its children for an operator", async () => {
    mocks.requirePageRole.mockResolvedValueOnce({ id: "u1" });

    await expect(OperatorGuard({ children: "admin" })).resolves.toBe("admin");
    expect(mocks.requirePageRole).toHaveBeenCalledWith("/admin", "operator");
  });

  it("lets the guard's redirect through", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT /sign-in?returnTo=%2Fadmin"));

    await expect(OperatorGuard({ children: "admin" })).rejects.toThrow("NEXT_REDIRECT");
  });
});
