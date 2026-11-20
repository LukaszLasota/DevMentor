import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn(), findOwn: vi.fn(), env: { APP_URL: "https://app.devmentor.test" as string | undefined } }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ mentorProfileService: { findOwn: mocks.findOwn }, env: mocks.env }),
}));
vi.mock("./ProfileEditor", () => ({
  ProfileEditor: (props: { shareBase: string; tagOptions: unknown[]; initial: { displayName: string } }) => (
    <div data-testid="editor">
      {props.initial.displayName}|{props.shareBase}|{props.tagOptions.length}
    </div>
  ),
}));

const { ProfileContent } = await import("./ProfileContent");

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["mentee", "mentor"] });
  mocks.findOwn.mockReset().mockResolvedValue({ displayName: "Ada" });
  mocks.env.APP_URL = "https://app.devmentor.test";
});

describe("ProfileContent", () => {
  it("guards /mentor/profile for mentors and hands the editor the owner DTO, four tag options and the share base", async () => {
    render(await ProfileContent());

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor/profile", "mentor");
    expect(mocks.findOwn).toHaveBeenCalledWith("u1");
    expect(screen.getByTestId("editor").textContent).toBe("Ada|https://app.devmentor.test/m/|4");
  });

  it("uses a relative share link without APP_URL", async () => {
    mocks.env.APP_URL = undefined;

    render(await ProfileContent());

    expect(screen.getByTestId("editor").textContent).toBe("Ada|/m/|4");
  });

  it("explains a missing profile instead of creating one", async () => {
    mocks.findOwn.mockResolvedValue(null);

    render(await ProfileContent());

    expect(screen.getByText("You have no mentor page yet")).toBeTruthy();
    expect(screen.queryByTestId("editor")).toBeNull();
  });

  it("reads nothing when the guard redirects", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(ProfileContent()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.findOwn).not.toHaveBeenCalled();
  });
});
