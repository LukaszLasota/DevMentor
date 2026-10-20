import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiCall, apiCallOrThrow } from "./apiCall";

function mockFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("apiCall", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the CSRF header and a JSON body", async () => {
    const fetchMock = mockFetch(() => json({ ok: true, data: { id: "1" } }));

    const result = await apiCall<{ id: string }>("/api/notes", { method: "POST", body: { title: "x" } });

    expect(result).toEqual({ ok: true, data: { id: "1" } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-devmentor-request")).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("returns the server failure envelope as-is", async () => {
    mockFetch(() =>
      json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid", fieldErrors: { title: ["Required"] } } }, 400),
    );

    const result = await apiCall("/api/notes");

    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid", fieldErrors: { title: ["Required"] } },
    });
  });

  it("reports a non-JSON response (e.g. proxy error page) without throwing", async () => {
    mockFetch(() => Promise.resolve(new Response("<html>Bad gateway</html>", { status: 502 })));

    const result = await apiCall("/api/notes");

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_RESPONSE", message: "Unexpected response from the server (HTTP 502)." },
    });
  });

  it("reports JSON that is not an envelope as an invalid response", async () => {
    mockFetch(() => json({ hello: "world" }));

    expect((await apiCall("/api/notes")).ok).toBe(false);
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await apiCall("/api/notes");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("NETWORK_ERROR");
  });
});

describe("apiCallOrThrow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data on success", async () => {
    mockFetch(() => json({ ok: true, data: [1, 2] }));

    await expect(apiCallOrThrow<number[]>("/api/notes")).resolves.toEqual([1, 2]);
  });

  it("throws ApiError with code and field errors on failure", async () => {
    mockFetch(() => json({ ok: false, error: { code: "NOT_FOUND", message: "Gone" } }, 404));

    await expect(apiCallOrThrow("/api/notes")).rejects.toEqual(new ApiError("NOT_FOUND", "Gone"));
  });
});
