import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckInboxNotice } from "./CheckInboxNotice";

function setup(onResend: () => Promise<string | null>) {
  const onUseDifferentEmail = vi.fn();
  render(
    <CheckInboxNotice title="Check your inbox to finish registration" onResend={onResend} onUseDifferentEmail={onUseDifferentEmail}>
      <p>We sent an email to ola@devmentor.test.</p>
    </CheckInboxNotice>,
  );

  return { onUseDifferentEmail, user: userEvent.setup() };
}

describe("CheckInboxNotice", () => {
  it("says where the link went inside a status region", () => {
    setup(vi.fn());

    expect(screen.getByRole("status").textContent).toContain("Check your inbox to finish registration");
    expect(screen.getByText("We sent an email to ola@devmentor.test.")).toBeTruthy();
  });

  it("sends a new link, busy while it runs, then confirms", async () => {
    let resolve: (value: string | null) => void = () => undefined;
    const onResend = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
    const { user } = setup(onResend);

    await user.click(screen.getByRole("button", { name: "Send a new link" }));
    expect((screen.getByRole("button", { name: /Sending…/ }) as HTMLButtonElement).disabled).toBe(true);

    resolve(null);
    expect(await screen.findByText("We sent a new link.")).toBeTruthy();
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("shows why a resend failed and lets the user try again", async () => {
    const onResend = vi.fn().mockResolvedValueOnce("We could not send the email.").mockResolvedValueOnce(null);
    const { user } = setup(onResend);

    await user.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("We could not send the email.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("We sent a new link.")).toBeTruthy();
    expect(screen.queryByText("We could not send the email.")).toBeNull();
  });

  it("goes back to the form with Use a different email", async () => {
    const { onUseDifferentEmail, user } = setup(vi.fn());

    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(onUseDifferentEmail).toHaveBeenCalledTimes(1);
  });
});
