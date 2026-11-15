import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailLinkRequest } from "./EmailLinkRequest";

type Reply = { status: number; body: unknown };

const accepted: Reply = { status: 202, body: { ok: true, data: { status: "check-inbox" } } };
const mailFailed: Reply = { status: 503, body: { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Mail failed." } } };
const limited: Reply = {
  status: 429,
  body: { ok: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts. Try again later.", retryAfterSeconds: 3000 } },
};

/** Stubs fetch with the replies in order and returns the mock to read the requests. */
function stubFetch(...replies: Reply[]) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.shift() ?? accepted;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function request(fetchMock: ReturnType<typeof stubFetch>, index: number) {
  const [path, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  return { path, body: JSON.parse(String(init.body)) };
}

function setup(returnTo?: string) {
  render(
    <EmailLinkRequest purpose="register" returnTo={returnTo} />,
  );
  return userEvent.setup();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EmailLinkRequest", () => {
  it("posts the normalized email with returnTo and shows check your inbox", async () => {
    const fetchMock = stubFetch(accepted);
    const user = setup("/mentors");

    expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("email");
    await user.type(screen.getByLabelText("Email"), " Ola@DevMentor.test ");
    await user.click(screen.getByRole("button", { name: "Send link" }));

    expect(await screen.findByText("Check your inbox to finish registration")).toBeTruthy();
    expect(screen.getByText("We sent an email to ola@devmentor.test. Open the link in it to set your password.")).toBeTruthy();
    expect(request(fetchMock, 0)).toEqual({ path: "/api/auth/register", body: { email: "ola@devmentor.test", returnTo: "/mentors" } });
  });

  it("validates the email on the client", async () => {
    const fetchMock = stubFetch();
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Send link" }));

    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the L06 copy when the mail cannot be sent, and the wait on 429", async () => {
    stubFetch(mailFailed, limited);
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ola@devmentor.test");
    await user.click(screen.getByRole("button", { name: "Send link" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We could not send the email. Try again later, or continue with GitHub.");

    await user.click(screen.getByRole("button", { name: "Send link" }));
    expect(await screen.findByText("Too many attempts. Try again in 50 minutes.")).toBeTruthy();
  });

  it("sends a new link through resend, with the mapped failure copy", async () => {
    const fetchMock = stubFetch(accepted, mailFailed, accepted);
    const user = setup("/mentors");

    await user.type(screen.getByLabelText("Email"), "ola@devmentor.test");
    await user.click(screen.getByRole("button", { name: "Send link" }));
    await user.click(await screen.findByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("We could not send the email. Try again later, or continue with GitHub.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByText("We sent a new link.")).toBeTruthy();
    expect(request(fetchMock, 2)).toEqual({
      path: "/api/auth/verify-email/resend",
      body: { email: "ola@devmentor.test", returnTo: "/mentors" },
    });
  });

  it("returns the form with the address ready to correct (Use a different email)", async () => {
    stubFetch(accepted);
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ola@devmentor.tset");
    await user.click(screen.getByRole("button", { name: "Send link" }));
    await user.click(await screen.findByRole("button", { name: "Use a different email" }));

    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ola@devmentor.tset");
  });
});
