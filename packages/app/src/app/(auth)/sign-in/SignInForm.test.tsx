import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

const { SignInForm } = await import("./SignInForm");

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function signIn(returnTo = "", password = "correct horse battery") {
  const user = userEvent.setup();
  render(<SignInForm returnTo={returnTo} />);
  await user.type(screen.getByLabelText("Email"), "Ola@devmentor.test");
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.replace.mockReset();
});

describe("SignInForm", () => {
  it("signs in with returnTo and goes where the server says", async () => {
    const fetchMock = stubFetch(200, { ok: true, data: { user: {}, redirectTo: "/mentors/ada" } });

    await signIn("/mentors/ada");

    expect(mocks.replace).toHaveBeenCalledWith("/mentors/ada");
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/auth/sign-in");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ola@devmentor.test", password: "correct horse battery", returnTo: "/mentors/ada" });
    expect((screen.getByLabelText("Password") as HTMLInputElement).autocomplete).toBe("current-password");
  });

  it("sends no returnTo when the page has none", async () => {
    const fetchMock = stubFetch(200, { ok: true, data: { user: {}, redirectTo: "/mentors" } });

    await signIn();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "ola@devmentor.test", password: "correct horse battery" });
  });

  it.each([
    [401, { code: "UNAUTHORIZED", message: "Invalid email or password." }, "Invalid email or password."],
    [429, { code: "TOO_MANY_REQUESTS", message: "x", retryAfterSeconds: 840 }, "Too many attempts. Try again in 14 minutes."],
    [503, { code: "SERVICE_UNAVAILABLE", message: "x" }, "Sign-in is not available right now. Try again later, or continue with GitHub."],
  ])("shows the %s message and stays", async (status, error, text) => {
    stubFetch(status, { ok: false, error });

    await signIn();

    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("asks for the password before calling the server", async () => {
    const fetchMock = stubFetch(200, {});
    const user = userEvent.setup();
    render(<SignInForm returnTo="" />);

    await user.type(screen.getByLabelText("Email"), "ola@devmentor.test");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
