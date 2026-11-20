import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MentorOwnerView } from "@devmentor/core/http";
import { ProfileEditor } from "./ProfileEditor";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const TAGS = [
  { value: "typescript", label: "TypeScript" },
  { value: "react", label: "React" },
  { value: "python", label: "Python" },
  { value: "ai-agents", label: "AI agents" },
] as const;

const READY = ["displayName", "publicWorkUrl", "bio", "stackTags"] as const;

function own(overrides: Partial<MentorOwnerView> = {}): MentorOwnerView {
  const base: MentorOwnerView = {
    slug: null,
    displayName: null,
    avatarUrl: null,
    publicWorkUrl: null,
    bio: null,
    stackTags: [],
    publishedAt: null,
    initialPublishDueAt: "2026-11-28T12:00:00.000Z",
    readiness: READY.map((key) => ({ key, met: false })),
    offerReadiness: [
      { key: "published", met: false },
      { key: "hasBookableSlot", met: false },
    ],
    prices: null,
    priceBounds: null,
  };

  return { ...base, ...overrides };
}

const complete = own({
  displayName: "Ada Lovelace",
  publicWorkUrl: "https://github.com/ada/engine",
  bio: "Wrote the first program.",
  stackTags: ["python"],
  readiness: READY.map((key) => ({ key, met: true })),
});
const published = { ...complete, slug: "ada-lovelace", publishedAt: "2026-11-20T10:00:00.000Z" };

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderEditor(initial: MentorOwnerView) {
  render(<ProfileEditor initial={initial} tagOptions={[...TAGS]} shareBase="https://app.devmentor.test/m/" />);

  return userEvent.setup();
}

const noRatings = () => expect(document.body.textContent).not.toMatch(/\b(ratings?|scores?|reviews?|rank(ing)?|stars?)\b/i);

describe("ProfileEditor", () => {
  it("shows an empty draft: the four fields, the checklist, Publish and no preview or share link", () => {
    renderEditor(own());

    expect(screen.getByRole("heading", { level: 1, name: "Your page" })).toBeTruthy();
    expect(screen.getByLabelText("Display name")).toBeTruthy();
    expect(screen.getByLabelText("Link to your public work")).toBeTruthy();
    expect(screen.getByLabelText("What you have done")).toBeTruthy();
    const tags = screen.getByRole("group", { name: "Stack tags" });
    expect(within(tags).getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.getByText("0 of 4 done")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    expect(screen.getByText("Publish uses your saved page: save your changes first.")).toBeTruthy();
    expect(screen.getByText("The preview appears once the four items above are saved.")).toBeTruthy();
    expect(screen.queryByLabelText("Your share link")).toBeNull();
    noRatings();
  });

  it("saves a draft without a link and updates the checklist from the answer", async () => {
    const user = renderEditor(own());
    const saved = own({ displayName: "Ada", readiness: READY.map((key) => ({ key, met: key === "displayName" })) });
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true, data: saved }));

    await user.type(screen.getByLabelText("Display name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(screen.getByText("1 of 4 done")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/mentors/me");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ displayName: "Ada", publicWorkUrl: null, bio: null, stackTags: [] });
  });

  it("names the missing link on its field when publishing is refused", async () => {
    const user = renderEditor(own());
    fetchMock.mockResolvedValueOnce(
      respond(400, {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Your page is not ready to publish yet.",
          fieldErrors: { publicWorkUrl: ["Add a link to your public work."] },
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Add a link to your public work.")).toBeTruthy();
    expect(screen.getByText("Your page is not ready to publish yet.")).toBeTruthy();
    expect(screen.getByLabelText("Link to your public work").getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/mentors/me/publish");
  });

  it("shows a failure without field errors as a message only", async () => {
    const user = renderEditor(complete);
    fetchMock.mockResolvedValueOnce(respond(409, { ok: false, error: { code: "CONFLICT", message: "Try again." } }));

    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Try again.")).toBeTruthy();
  });

  it("previews a complete draft and, after publishing, shows the share link and Unpublish", async () => {
    const user = renderEditor(complete);
    const preview = screen.getByRole("region", { name: "Preview: what visitors see" });
    expect(within(preview).getByRole("heading", { name: "Ada Lovelace" })).toBeTruthy();
    expect(within(preview).getByText("Not bookable yet")).toBeTruthy();
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true, data: published }));

    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Your page is published.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect((screen.getByLabelText("Your share link") as HTMLInputElement).value).toBe(
      "https://app.devmentor.test/m/ada-lovelace",
    );
    expect(screen.getByText("This link stays the same if you change your name.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByText("Before you can publish")).toBeNull();
    noRatings();
  });

  it("unpublishes after confirmation and hides the share link", async () => {
    const user = renderEditor(published);
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true, data: { ...published, publishedAt: null } }));

    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    await user.click(screen.getByRole("button", { name: "Unpublish page" }));

    expect(await screen.findByText("Your page is hidden.")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/mentors/me/unpublish");
    expect(screen.queryByLabelText("Your share link")).toBeNull();
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
  });
});
