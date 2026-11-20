import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn(), findOwn: vi.fn(), listMine: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) =>
    fn({ mentorProfileService: { findOwn: mocks.findOwn }, slotService: { listMine: mocks.listMine } }),
}));
vi.mock("./SlotsEditor", () => ({
  SlotsEditor: ({ initial }: { initial: { id: string }[] }) => <div data-testid="editor">{initial.map((slot) => slot.id).join(",")}</div>,
}));

const { SlotsContent } = await import("./SlotsContent");

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["mentee", "mentor"] });
  mocks.findOwn.mockReset().mockResolvedValue({ slug: null });
  mocks.listMine.mockReset().mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
});

describe("SlotsContent", () => {
  it("guards /mentor/slots for mentors and hands the editor the upcoming slots", async () => {
    render(await SlotsContent());

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor/slots", "mentor");
    expect(mocks.listMine).toHaveBeenCalledWith("u1", "upcoming");
    expect(screen.getByRole("heading", { level: 1, name: "Open times" })).toBeTruthy();
    expect(screen.getByTestId("editor").textContent).toBe("s1,s2");
  });

  it("explains a missing profile and reads no slots", async () => {
    mocks.findOwn.mockResolvedValue(null);

    render(await SlotsContent());

    expect(screen.getByText("You have no mentor page yet")).toBeTruthy();
    expect(mocks.listMine).not.toHaveBeenCalled();
  });

  it("reads nothing when the guard redirects", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(SlotsContent()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.findOwn).not.toHaveBeenCalled();
  });
});
