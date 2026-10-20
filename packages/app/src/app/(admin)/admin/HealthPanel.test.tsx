import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthPanel } from "./HealthPanel";

const envelope = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("HealthPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads /api/health and shows the database row", async () => {
    const fetchMock = vi.fn(() => envelope({ ok: true, data: { database: "up" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<HealthPanel />);

    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(await screen.findByRole("cell", { name: "up" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
  });

  it("shows the error and recovers after Try again", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        envelope({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database is unreachable." } }, 503),
      )
      .mockImplementationOnce(() => envelope({ ok: true, data: { database: "up" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<HealthPanel />);

    expect((await screen.findByRole("alert")).textContent).toContain("Database is unreachable.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("cell", { name: "up" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    const consoleError = vi.spyOn(console, "error");

    const { unmount } = render(<HealthPanel />);
    unmount();
    resolve(new Response(JSON.stringify({ ok: true, data: { database: "up" } })));
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
