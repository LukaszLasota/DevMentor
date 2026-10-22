import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_ERRORS, SignInPanel } from "./auth/SignInPanel";
import { InvitationPanel } from "./invitations/InvitationPanel";
import { CopyShareLink } from "./mentors/CopyShareLink";
import { ProfileActions } from "./mentors/ProfileActions";
import { ReadinessChecklist } from "./mentors/ReadinessChecklist";
import { SlotsPanel } from "./mentors/SlotsPanel";
import { PayoutStatusPanel } from "./payouts/PayoutStatusPanel";

afterEach(() => vi.restoreAllMocks());

describe("E01 product components", () => {
  it("ReadinessChecklist says done or to do in words and links the fix", () => {
    render(
      <ReadinessChecklist
        title="Before you can publish"
        items={[
          { key: "displayName", label: "Display name", met: true },
          { key: "price50", label: "Price for 50 minutes", met: false, href: "/mentor/prices", detail: "Above the allowed range" },
          { key: "slot", label: "At least one open time", met: false },
        ]}
      />,
    );
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByText("Done:")).toBeTruthy();
    expect(screen.getAllByText("To do:")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Fix" }).getAttribute("href")).toBe("/mentor/prices");
  });

  it("ReadinessChecklist uses a custom action label", () => {
    render(<ReadinessChecklist title="t" items={[{ key: "k", label: "Prices", met: false, href: "/p", actionLabel: "Set prices" }]} />);
    expect(screen.getByRole("link", { name: "Set prices" })).toBeTruthy();
  });

  it("CopyShareLink copies and announces, or selects the text when copy is blocked", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyShareLink url="https://devmentor.example/m/marta-kowal" />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://devmentor.example/m/marta-kowal");
    expect(screen.getByRole("status").textContent).toBe("Link copied.");

    writeText.mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(screen.getByRole("status").textContent).toContain("The link is selected");

    await user.click(screen.getByLabelText("Your share link"));
    expect(document.activeElement).toBe(screen.getByLabelText("Your share link"));
  });

  it("ProfileActions publishes, and asks before unpublishing", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const onUnpublish = vi.fn();
    const { rerender } = render(<ProfileActions published={false} onPublish={onPublish} onUnpublish={onUnpublish} />);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledOnce();

    rerender(<ProfileActions published onPublish={onPublish} onUnpublish={onUnpublish} />);
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it published" }));
    await user.click(screen.getByRole("button", { name: "Unpublish page" }));
    expect(onUnpublish).toHaveBeenCalledOnce();
  });

  it("SlotsPanel shows the empty state with the next step", () => {
    render(<SlotsPanel slots={[]} showPast={false} onShowPastChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("No upcoming slots.")).toBeTruthy();
    expect(screen.getByText("Publish one so mentees can book you.")).toBeTruthy();
  });

  it("SlotsPanel lists states, toggles past slots and removes after confirmation", async () => {
    const user = userEvent.setup();
    const onShowPastChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <SlotsPanel
        slots={[
          { id: "a", startsAt: "2026-11-05T17:30:00Z", meetsLeadTime: true },
          { id: "b", startsAt: "2026-11-05T09:00:00Z", meetsLeadTime: false },
          { id: "c", startsAt: "2026-10-01T09:00:00Z", meetsLeadTime: false, past: true },
        ]}
        showPast
        onShowPastChange={onShowPastChange}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("Bookable")).toBeTruthy();
    expect(screen.getByText("Less than 2 h away")).toBeTruthy();
    expect(screen.getByText("Past")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Remove slot/ })).toHaveLength(2);

    await user.click(screen.getByRole("checkbox", { name: "Show past" }));
    expect(onShowPastChange).toHaveBeenCalledWith(false);

    await user.click(screen.getAllByRole("button", { name: /Remove slot/ })[0]);
    await user.click(screen.getByRole("button", { name: "Remove slot" }));
    expect(onRemove).toHaveBeenCalledWith("a");
  });

  it("SignInPanel puts GitHub first and explains errors and rate limits", () => {
    render(
      <SignInPanel
        githubHref="/api/auth/github"
        emailForm={<form aria-label="Email sign-in" />}
        registerLink={<a href="/register">Create an account</a>}
        error="github_cancelled"
        retryAfterSeconds={90}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to DevMentor" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with GitHub" }).getAttribute("href")).toBe("/api/auth/github");
    expect(screen.getByRole("alert").textContent).toBe(SIGN_IN_ERRORS.github_cancelled);
    expect(screen.getByText("Try again in 2 min.")).toBeTruthy();
  });

  it("SignInPanel without errors shows no alert", () => {
    render(<SignInPanel githubHref="/g" emailForm={null} registerLink={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("InvitationPanel covers signed-out, match, mismatch and invalid", () => {
    const { rerender } = render(
      <InvitationPanel
        state={{ kind: "signed-out", email: "marta@example.com", tags: ["typescript"], githubHref: "/g", emailHref: "/e" }}
      />,
    );
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Sign in with GitHub", "Sign in with email"]);

    rerender(
      <InvitationPanel acceptAction="/api/invitations/accept" state={{ kind: "match", email: "m@x.io", tags: [], accountEmail: "m@x.io" }} />,
    );
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeTruthy();

    rerender(<InvitationPanel state={{ kind: "mismatch", email: "m@x.io", accountEmail: "other@x.io", signOutHref: "/out" }} />);
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign out" })).toBeTruthy();

    rerender(<InvitationPanel state={{ kind: "invalid" }} />);
    expect(screen.getByRole("heading", { name: "This invitation is not valid" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("PayoutStatusPanel shows one state at a time with Refresh status", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onRefresh = vi.fn();
    const { rerender } = render(<PayoutStatusPanel state={{ kind: "none" }} onStart={onStart} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: "Set up payouts" }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();

    rerender(<PayoutStatusPanel state={{ kind: "action_required", guidance: ["Add your date of birth"] }} onStart={onStart} onRefresh={onRefresh} />);
    expect(screen.getByText("Stripe needs a few more details")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(onRefresh).toHaveBeenCalledOnce();

    rerender(<PayoutStatusPanel state={{ kind: "restricted", guidance: ["Confirm your bank account"] }} onStart={onStart} onRefresh={onRefresh} />);
    expect(screen.getByText("Payouts are paused")).toBeTruthy();

    rerender(<PayoutStatusPanel state={{ kind: "enabled" }} onStart={onStart} onRefresh={onRefresh} />);
    expect(screen.getByText("Payouts enabled")).toBeTruthy();

    rerender(<PayoutStatusPanel state={{ kind: "pending_verification" }} onStart={onStart} onRefresh={onRefresh} />);
    expect(screen.getByText("Stripe is checking your details")).toBeTruthy();

    rerender(<PayoutStatusPanel state={{ kind: "failed" }} onStart={onStart} onRefresh={onRefresh} />);
    expect(screen.getByRole("alert").textContent).toBe("We could not set up payouts — contact us.");
  });
});
