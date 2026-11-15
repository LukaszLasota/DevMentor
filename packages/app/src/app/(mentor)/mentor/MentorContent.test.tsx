import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn(), publishDueAt: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ mentorProfileService: { publishDueAt: mocks.publishDueAt } }),
}));

const { MentorContent } = await import("./MentorContent");

const DUE = new Date("2026-11-28T12:00:00.000Z");
const noQuery = () => Promise.resolve({});

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["mentee", "mentor"] });
  mocks.publishDueAt.mockReset().mockResolvedValue(DUE);
});

describe("MentorContent", () => {
  it("guards /mentor for mentors and shows the publish-by date of the user's profile", async () => {
    render(await MentorContent({ searchParams: noQuery() }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor", "mentor");
    expect(mocks.publishDueAt).toHaveBeenCalledWith("u1");
    expect(screen.getByRole("heading", { level: 1, name: "Your mentor page" })).toBeTruthy();
    const title = screen.getByRole("heading", { level: 2 });
    expect(title.textContent).toMatch(/^Publish at least one bookable session by \w{3} \d{1,2} \w{3}$/);
    expect(title.querySelector("time")?.getAttribute("dateTime")).toBe(DUE.toISOString());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists the onboarding steps as to-dos without links (#23–#25 later)", async () => {
    render(await MentorContent({ searchParams: noQuery() }));

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "To do: Publish your page",
      "To do: Set your prices",
      "To do: Publish a slot",
    ]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("without a stored date the heading has no date", async () => {
    mocks.publishDueAt.mockResolvedValue(null);

    render(await MentorContent({ searchParams: noQuery() }));

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Publish at least one bookable session");
  });

  it("says why a mentor was sent here from an operator page (L03)", async () => {
    render(await MentorContent({ searchParams: Promise.resolve({ notice: "operator_only" }) }));

    expect(screen.getByRole("status").textContent).toBe("This page is for operators.");
  });

  it("renders nothing and reads no profile when the guard redirects", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT /mentors?notice=mentor_only"));

    await expect(MentorContent({ searchParams: noQuery() })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.publishDueAt).not.toHaveBeenCalled();
  });
});
