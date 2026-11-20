import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { AnswerForm } = await import("./AnswerForm");

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const ANSWER = "Use a queue for the retries and keep it idempotent.";

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("AnswerForm", () => {
  it("submits the answer once and re-reads the page", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { body: ANSWER } }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AnswerForm sessionId={ID} />);
    expect(document.body.textContent).toContain("Sent once; the mentee is emailed that it is ready.");
    await userEvent.type(screen.getByLabelText(/Your written answer/), ANSWER);
    await userEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${ID}/answer`, expect.objectContaining({ method: "POST", body: JSON.stringify({ body: ANSWER }) }));
  });

  it("checks the length before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AnswerForm sessionId={ID} />);
    await userEvent.type(screen.getByLabelText(/Your written answer/), "short");
    await userEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByText("Write the answer in 20 to 20000 characters.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
