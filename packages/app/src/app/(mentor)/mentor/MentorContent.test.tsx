import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn(), findOwn: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ mentorProfileService: { findOwn: mocks.findOwn } }),
}));

const { MentorContent } = await import("./MentorContent");

const DUE = new Date("2026-11-28T12:00:00.000Z");
const noQuery = () => Promise.resolve({});

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["mentee", "mentor"] });
  mocks.findOwn.mockReset().mockResolvedValue({ initialPublishDueAt: DUE.toISOString(), publishedAt: null, offerReadiness: [] });
});

describe("MentorContent", () => {
  it("guards /mentor for mentors and shows the publish-by date of the user's profile", async () => {
    render(await MentorContent({ searchParams: noQuery() }));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor", "mentor");
    expect(mocks.findOwn).toHaveBeenCalledWith("u1");
    expect(screen.getByRole("heading", { level: 1, name: "Your mentor page" })).toBeTruthy();
    const title = screen.getByRole("heading", { level: 2 });
    expect(title.textContent).toMatch(/^Publish at least one bookable session by \w{3} \d{1,2} \w{3}$/);
    expect(title.querySelector("time")?.getAttribute("dateTime")).toBe(DUE.toISOString());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists the onboarding steps; page and slot steps link to their pages (#24 later)", async () => {
    render(await MentorContent({ searchParams: noQuery() }));

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "To do: Publish your pageEdit your page",
      "To do: Set your prices",
      "To do: Publish a slotAdd a slot",
    ]);
    expect(screen.getByRole("link", { name: "Edit your page" }).getAttribute("href")).toBe("/mentor/profile");
    expect(screen.getByRole("link", { name: "Add a slot" }).getAttribute("href")).toBe("/mentor/slots");
  });

  it("marks the slot step done only with a bookable slot (hasBookableSlot)", async () => {
    mocks.findOwn.mockResolvedValue({
      initialPublishDueAt: DUE.toISOString(),
      publishedAt: null,
      offerReadiness: [
        { key: "published", met: false },
        { key: "hasBookableSlot", met: true },
      ],
    });

    render(await MentorContent({ searchParams: noQuery() }));

    expect(screen.getAllByRole("listitem")[2]?.textContent).toBe("Done: Publish a slot");
  });

  it("marks the page step done once the page is published", async () => {
    mocks.findOwn.mockResolvedValue({ initialPublishDueAt: DUE.toISOString(), publishedAt: DUE.toISOString(), offerReadiness: [] });

    render(await MentorContent({ searchParams: noQuery() }));

    expect(screen.getAllByRole("listitem")[0]?.textContent).toBe("Done: Publish your page");
  });

  it.each([
    ["a profile without a date", { initialPublishDueAt: null, publishedAt: null, offerReadiness: [] }],
    ["no profile (mentor granted by hand)", null],
  ])("with %s the heading has no date", async (_case, own) => {
    mocks.findOwn.mockResolvedValue(own);

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
    expect(mocks.findOwn).not.toHaveBeenCalled();
  });
});
