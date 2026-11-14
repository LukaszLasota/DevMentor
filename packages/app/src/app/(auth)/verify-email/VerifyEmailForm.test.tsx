import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

const { VerifyEmailForm } = await import("./VerifyEmailForm");

const TOKEN = "AbC_123-xyz";
const PASSWORD = "correct horse battery";

function stubFetch(...replies: { status: number; body: unknown }[]) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.shift() ?? { status: 202, body: { ok: true, data: { status: "check-inbox" } } };
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function body(fetchMock: ReturnType<typeof stubFetch>, index: number) {
  const [path, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  return { path, body: JSON.parse(String(init.body)) };
}

function open(hash: string) {
  window.location.hash = hash;
  render(<VerifyEmailForm />);
  return userEvent.setup();
}

async function setPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("New password"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "Set password and sign in" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.replace.mockReset();
  window.location.hash = "";
});

describe("VerifyEmailForm", () => {
  it("renders a loading state on the server, where there is no fragment", () => {
    const html = renderToString(<VerifyEmailForm />);

    expect(html).toContain("Set your password");
    expect(html).toContain("Loading");
    expect(html).not.toContain("New password");
  });

  it("sets the password with the token and returnTo from the fragment, then goes to redirectTo", async () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true, data: { user: {}, redirectTo: "/mentors/ada" } } });
    const user = open(`#token=${TOKEN}&returnTo=%2Fmentors%2Fada`);

    await setPassword(user);

    expect(body(fetchMock, 0)).toEqual({
      path: "/api/auth/verify-email",
      body: { token: TOKEN, password: PASSWORD, returnTo: "/mentors/ada" },
    });
    expect(mocks.replace).toHaveBeenCalledWith("/mentors/ada");
  });

  it("has one password field with Show password (L05) and checks the length first", async () => {
    const fetchMock = stubFetch();
    const user = open(`#token=${TOKEN}`);
    const input = screen.getByLabelText("New password") as HTMLInputElement;

    expect(screen.getAllByLabelText(/password/i).filter((el) => el.tagName === "INPUT")).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: "Show password" }));
    expect(input.type).toBe("text");

    await user.type(input, "too short");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));
    expect(screen.getByText("Password must be at least 12 characters.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches to the link-invalid view on VERIFICATION_LINK_INVALID and resends with returnTo", async () => {
    const fetchMock = stubFetch(
      { status: 400, body: { ok: false, error: { code: "VERIFICATION_LINK_INVALID", message: "This link is invalid or has expired." } } },
      { status: 202, body: { ok: true, data: { status: "check-inbox" } } },
    );
    const user = open(`#token=${TOKEN}&returnTo=%2Fmentors`);

    await setPassword(user);

    expect(await screen.findByText("This link does not work any more")).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
    await user.type(screen.getByLabelText("Email"), "ola@devmentor.test");
    await user.click(screen.getByRole("button", { name: "Send a new link" }));

    expect(await screen.findByText("If ola@devmentor.test still needs a password, we sent it a new link. It works for 24 hours.")).toBeTruthy();
    expect(body(fetchMock, 1)).toEqual({ path: "/api/auth/verify-email/resend", body: { email: "ola@devmentor.test", returnTo: "/mentors" } });
  });

  it.each(["", "#returnTo=%2Fmentors", "#token=not%20a%20token"])("shows the link-invalid view for the fragment %j", (hash) => {
    open(hash);

    expect(screen.getByText("This link does not work any more")).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it.each([
    [503, { code: "SERVICE_UNAVAILABLE", message: "x" }, "We could not set your password right now. Try again in a minute."],
    [400, { code: "VALIDATION_ERROR", message: "Check the highlighted fields." }, "Check the highlighted fields."],
  ])("keeps the form with the message on %s", async (status, error, text) => {
    stubFetch({ status, body: { ok: false, error } });
    const user = open(`#token=${TOKEN}`);

    await setPassword(user);

    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe(PASSWORD);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("follows a fragment change (hashchange)", async () => {
    open("");
    expect(screen.getByText("This link does not work any more")).toBeTruthy();

    await act(async () => {
      window.location.hash = `#token=${TOKEN}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(screen.getByLabelText("New password")).toBeTruthy();
  });
});
