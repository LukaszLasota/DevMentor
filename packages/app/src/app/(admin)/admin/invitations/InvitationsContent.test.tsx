import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn(), board: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("./InvitationsBoard", () => ({
  InvitationsBoard: (props: unknown) => {
    mocks.board(props);
    return <div>invitations board</div>;
  },
}));

const { InvitationsContent } = await import("./InvitationsContent");
const { default: InvitationsPage } = await import("./page");
const { INVITATIONS_STOPPED_MESSAGE } = await import("@devmentor/core");

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["operator"] });
  mocks.board.mockReset();
});

describe("InvitationsContent", () => {
  it("guards /admin/invitations for operators and hands the board the tags and the stop sentence", async () => {
    render(await InvitationsContent({ searchParams: Promise.resolve({}) }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/admin/invitations", "operator");
    expect(screen.getByRole("heading", { level: 1, name: "Invitations" })).toBeTruthy();
    expect(screen.getByText("invitations board")).toBeTruthy();
    expect(mocks.board).toHaveBeenCalledWith({
      tagOptions: [
        { value: "typescript", label: "TypeScript" },
        { value: "react", label: "React" },
        { value: "python", label: "Python" },
        { value: "ai-agents", label: "AI agents" },
      ],
      stoppedMessage: INVITATIONS_STOPPED_MESSAGE,
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the role notice of a redirect", async () => {
    render(await InvitationsContent({ searchParams: Promise.resolve({ notice: "mentor_only" }) }));

    expect(screen.getByRole("status").textContent).toBe("This page is for mentors.");
  });

  it("renders nothing when the guard redirects", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT /mentors?notice=operator_only"));

    await expect(InvitationsContent({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.board).not.toHaveBeenCalled();
  });
});

describe("InvitationsPage", () => {
  it("renders the request-time content inside its main region", () => {
    render(<InvitationsPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

    expect(screen.getByRole("main")).toBeTruthy();
  });
});
