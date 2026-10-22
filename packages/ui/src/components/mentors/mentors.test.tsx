import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as entry from "../../mentors";
import { formatInstant, LocalTime } from "../../time/LocalTime";
import { MentorAvatar } from "./MentorAvatar";
import { MentorCard } from "./MentorCard";
import { MentorListSkeleton } from "./MentorListSkeleton";
import { MentorPageView } from "./MentorPageView";
import { MentorTagFilter } from "./MentorTagFilter";
import { publicWorkLabel, stackTagLabel } from "./vocabulary";

const prices = { price25: "$40.00", price50: "$75.00" };
const mentor = {
  slug: "marta-kowal",
  displayName: "Marta Kowal",
  avatarUrl: null,
  publicWorkUrl: "https://github.com/kubernetes/ingress-nginx/pull/12345",
  bio: "Upgraded ingress-nginx to 1.28 on a 40-node cluster.",
  stackTags: ["typescript", "ai-agents"] as const,
  prices,
};

describe("public mentor components", () => {
  it("entry exports only Tailwind components and helpers", () => {
    expect(Object.keys(entry).sort()).toEqual(
      [
        "InvitationPanel",
        "LocalTime",
        "MentorAvatar",
        "MentorCard",
        "MentorListSkeleton",
        "MentorPageView",
        "MentorTagFilter",
        "STACK_TAGS",
        "SessionFacts",
        "TagList",
        "TextSessionNotice",
        "buttonVariants",
        "formatInstant",
        "publicWorkLabel",
        "stackTagLabel",
      ].sort(),
    );
  });

  it("vocabulary labels tags and shortens public-work links", () => {
    expect(stackTagLabel("ai-agents")).toBe("AI agents");
    expect(publicWorkLabel("https://github.com/")).toBe("github.com");
    const long = publicWorkLabel(`https://example.com/${"a".repeat(80)}`);
    expect(long).toHaveLength(60);
    expect(long.endsWith("…")).toBe(true);
  });

  it("LocalTime prints the instant in the viewer's zone after mount", () => {
    render(<LocalTime iso="2026-11-14T18:30:00Z" format="date" />);
    const time = screen.getByText(formatInstant("2026-11-14T18:30:00Z", "date"));
    expect(time.getAttribute("dateTime")).toBe("2026-11-14T18:30:00Z");
    expect(formatInstant("2026-11-14T18:30:00Z", "datetime", "UTC")).toBe("Sat 14 Nov, 18:30");
  });

  it("MentorAvatar shows the photo or the initial", () => {
    const { container, rerender } = render(<MentorAvatar displayName="marta" avatarUrl="https://avatars.example/1.png" size="lg" />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    rerender(<MentorAvatar displayName="marta" avatarUrl={null} />);
    expect(screen.getByText("M").getAttribute("aria-hidden")).toBe("true");
  });

  it("MentorCard links the name, shows facts and the next open time, and no rating", () => {
    render(<MentorCard {...mentor} nextBookableSlotAt="2026-11-14T18:30:00Z" />);
    expect(screen.getByRole("link", { name: "Marta Kowal" }).getAttribute("href")).toBe("/m/marta-kowal");
    expect(screen.getByRole("link", { name: /github.com/ }).getAttribute("rel")).toBe("noopener nofollow ugc");
    expect(screen.getByRole("list", { name: "Session prices" }).textContent).toBe("25 min$40.0050 min$75.00");
    expect(screen.getByText(/Next open time/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/rating|stars|top|popular/i);
  });

  it("MentorTagFilter marks the active tag and links All", () => {
    const { rerender } = render(<MentorTagFilter active="react" />);
    expect(screen.getByRole("link", { name: "React" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe("/mentors");
    rerender(<MentorTagFilter active={null} />);
    expect(screen.getByRole("link", { name: "All" }).getAttribute("aria-current")).toBe("page");
    rerender(<MentorTagFilter active={null} basePath="/favorites" />);
    expect(screen.getByRole("link", { name: "Python" }).getAttribute("href")).toBe("/favorites?tag=python");
  });

  it("MentorListSkeleton is one busy status region", () => {
    const { rerender } = render(<MentorListSkeleton />);
    expect(screen.getByRole("status", { name: "Loading mentors" }).getAttribute("aria-busy")).toBe("true");
    rerender(<MentorListSkeleton label="Loading favorites" />);
    expect(screen.getByRole("status", { name: "Loading favorites" })).toBeTruthy();
  });

  it("MentorPageView lists open times and marks those past the lead time", () => {
    render(
      <MentorPageView
        {...mentor}
        offerReady
        slots={[
          { id: "a", startsAt: "2026-11-14T18:30:00Z", meetsLeadTime: true },
          { id: "b", startsAt: "2026-11-14T10:00:00Z", meetsLeadTime: false },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Marta Kowal" })).toBeTruthy();
    expect(screen.getByText("Sessions are text — no video call. 25 or 50 minutes.")).toBeTruthy();
    const items = screen.getByRole("list", { name: "Open times" }).querySelectorAll("li");
    expect(items[1].getAttribute("aria-disabled")).toBe("true");
    expect(items[1].textContent).toContain("Starts in less than two hours — no longer bookable");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("MentorPageView says only 'Not bookable yet' when the offer is not ready", () => {
    render(<MentorPageView {...mentor} prices={null} offerReady={false} slots={[]} />);
    expect(screen.getByText("Not bookable yet")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Session prices" })).toBeNull();
  });
});

describe("LocalTime on the server", () => {
  it("prints UTC with a label before hydration", async () => {
    const { renderToString } = await import("react-dom/server");
    expect(renderToString(<LocalTime iso="2026-11-14T18:30:00Z" />)).toContain("Sat 14 Nov, 18:30 UTC");
  });
});
