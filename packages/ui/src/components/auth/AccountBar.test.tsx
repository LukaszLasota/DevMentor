import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountBar } from "./AccountBar";
import { SignOutButton } from "./SignOutButton";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "../../backend/api/types";

const envelope = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountBar", () => {
  it("shows the email and the sign-out control, and no navigation (L04; links live in the sidebar)", () => {
    render(<AccountBar user={{ email: "ola@devmentor.test" }} signOut={<button>Sign out</button>} />);

    const header = screen.getByRole("banner");
    expect(within(header).getByText("ola@devmentor.test")).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(header.querySelector("img")).toBeNull();
  });

  it("shows the area and the GitHub avatar", () => {
    render(<AccountBar user={{ email: "adam@devmentor.test", avatarUrl: "https://avatars.example/adam" }} area="Admin" signOut={null} />);

    expect(screen.getByText("Admin", { selector: "span" })).toBeTruthy();
    const avatar = screen.getByRole("banner").querySelector("img");
    expect(avatar?.getAttribute("src")).toBe("https://avatars.example/adam");
    expect(avatar?.getAttribute("alt")).toBe("");
    expect(avatar?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});

describe("SignOutButton", () => {
  it("posts the sign-out with the CSRF header, stays busy and hands over to the app (s10)", async () => {
    const fetchMock = vi.fn(() => envelope({ ok: true, data: null }));
    vi.stubGlobal("fetch", fetchMock);
    const onSignedOut = vi.fn();

    render(<SignOutButton onSignedOut={onSignedOut} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSignedOut).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/auth/sign-out");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get(CSRF_HEADER)).toBe(CSRF_HEADER_VALUE);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables the button while the request runs", async () => {
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));

    render(<SignOutButton onSignedOut={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Signing out…");
    resolve(new Response(JSON.stringify({ ok: true, data: null })));
  });

  it("shows the failure and lets the user try again", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => envelope({ ok: false, error: { code: "INTERNAL", message: "Something failed on our side." } }, 500))
      .mockImplementationOnce(() => envelope({ ok: true, data: null }));
    vi.stubGlobal("fetch", fetchMock);
    const onSignedOut = vi.fn();

    render(<SignOutButton onSignedOut={onSignedOut} />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sign-out did not finish");
    expect(alert.textContent).toContain("Something failed on our side.");
    expect(onSignedOut).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
