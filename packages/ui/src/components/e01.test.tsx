import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLE_NOTICES, RoleNotice } from "./auth/RoleNotice";
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
    expect(
      screen.getByText(
        "Publishing shows your name, GitHub avatar (if any), link, description and tags to anyone with the link.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledOnce();

    rerender(<ProfileActions published onPublish={onPublish} onUnpublish={onUnpublish} />);
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it published" }));
    await user.click(screen.getByRole("button", { name: "Unpublish page" }));
    expect(onUnpublish).toHaveBeenCalledOnce();
  });

  it("SlotsPanel shows the empty state with the next step", () => {
    const { rerender } = render(<SlotsPanel slots={[]} showPast={false} onShowPastChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("No upcoming slots.")).toBeTruthy();
    expect(screen.getByText("Publish one so mentees can book you.")).toBeTruthy();

    rerender(<SlotsPanel slots={[]} showPast onShowPastChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("No past slots.")).toBeTruthy();
    expect(screen.queryByText("Publish one so mentees can book you.")).toBeNull();
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
    expect(screen.getByText("Use GitHub, or your email and password.")).toBeTruthy();
    expect(screen.getByRole("form", { name: "Email sign-in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create an account" })).toBeTruthy();
    expect(screen.getByText("Forgot your password? Use GitHub with the same email.")).toBeTruthy();
  });

  it("SignInPanel without errors shows no alert", () => {
    render(<SignInPanel githubHref="/g" emailForm={null} registerLink={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("SignInPanel without an email form offers GitHub only and still explains a forgotten password (L12)", () => {
    render(<SignInPanel githubHref="/g" />);
    expect(screen.getByText("Use your GitHub account.")).toBeTruthy();
    expect(screen.queryByText("or with email")).toBeNull();
    expect(screen.queryByText(/No account yet/)).toBeNull();
    expect(screen.getByText("Forgot your password? Use GitHub with the same email.")).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Continue with GitHub"]);
  });

  it("SignInPanel says the session ended (L03) and explains an interrupted GitHub sign-in", () => {
    render(<SignInPanel githubHref="/g" sessionEnded error="github_state_invalid" />);
    expect(screen.getByRole("status").textContent).toBe("Your session ended. Sign in again.");
    expect(screen.getByRole("alert").textContent).toBe(SIGN_IN_ERRORS.github_state_invalid);
  });

  it.each(Object.entries(ROLE_NOTICES))("RoleNotice %s says %s", (notice, text) => {
    render(<RoleNotice notice={notice} />);
    expect(screen.getByRole("status").textContent).toBe(text);
  });

  it.each([
    ["missing", undefined],
    ["unknown", "admin_only"],
    ["inherited key", "toString"],
    ["repeated", ["mentor_only", "mentor_only"]],
  ])("RoleNotice renders nothing when the notice is %s", (_case, notice) => {
    const { container } = render(<RoleNotice notice={notice} />);
    expect(container.innerHTML).toBe("");
  });

  it("InvitationPanel covers signed-out, match, mismatch, already-mentor and invalid", () => {
    const { rerender } = render(
      <InvitationPanel
        state={{ kind: "signed-out", email: "marta@example.com", tags: ["typescript"], githubHref: "/g", emailHref: "/e" }}
      />,
    );
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Sign in with GitHub", "/g"],
      ["Sign in with email", "/e"],
    ]);
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<InvitationPanel state={{ kind: "match", email: "m@x.io", tags: [], accountEmail: "m@x.io" }} />);
    expect(screen.getByText("m@x.io", { selector: ".text-foreground" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeTruthy();

    rerender(
      <InvitationPanel
        state={{ kind: "mismatch", email: "m@x.io", accountEmail: "other@x.io" }}
        signOut={<button type="button">Sign out</button>}
      />,
    );
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByText(/You are signed in as/).textContent).toBe(
      "You are signed in as other@x.io. Sign out, then sign in with m@x.io to accept.",
    );

    rerender(<InvitationPanel state={{ kind: "already-mentor", mentorHref: "/mentor" }} />);
    expect(screen.getByRole("heading", { name: "You are already a mentor." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to your mentor page" }).getAttribute("href")).toBe("/mentor");

    rerender(<InvitationPanel state={{ kind: "invalid" }} />);
    expect(screen.getByRole("heading", { name: "This invitation is not valid" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("InvitationPanel accept: calls onAccept, busy while accepting, error with Try again (L07)", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const state = { kind: "match", email: "m@x.io", tags: ["react"], accountEmail: "m@x.io" } as const;
    const { rerender } = render(<InvitationPanel state={state} onAccept={onAccept} />);

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(<InvitationPanel state={state} onAccept={onAccept} accepting acceptError="Network error." />);
    const busy = screen.getByRole("button", { name: "Accepting…" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(<InvitationPanel state={state} onAccept={onAccept} acceptError="Network error." />);
    expect(screen.getByRole("alert").textContent).toBe("Network error. Nothing changed.");
    expect(screen.getByRole("button", { name: "Accept invitation" }).getAttribute("aria-busy")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onAccept).toHaveBeenCalledTimes(2);
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
