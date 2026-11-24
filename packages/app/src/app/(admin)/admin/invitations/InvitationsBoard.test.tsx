import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvitationsBoard } from "./InvitationsBoard";

const STOPPED = "Invitations are stopped: fewer than 5 of the first 20 published a slot within two weeks. Interview the decliners first.";
const TAGS = [
  { value: "typescript", label: "TypeScript" },
  { value: "react", label: "React" },
];

const row = (email: string, status = "waiting") => ({ id: email, email, mentorName: null, stackTags: ["react"], status, publishDueAt: null });
const batch = (number: number, closedAt: string | null, state = closedAt === null ? "open" : "full") => ({
  number,
  state,
  openedAt: "2026-11-01T09:00:00.000Z",
  closedAt,
  counts: { sent: 1, accepted: 0, published: 0 },
  invitations: [row(`b${number}@example.com`)],
});

const EMPTY = { stopped: false, canOpen: true, nextBatchNumber: 1, batches: [], beforeBatches: [] };
const FULL = { stopped: false, canOpen: true, nextBatchNumber: 2, batches: [batch(1, "2026-11-02T00:00:00.000Z")], beforeBatches: [] };
const OPEN = {
  stopped: false,
  canOpen: false,
  nextBatchNumber: 3,
  batches: [batch(2, null), batch(1, "2026-11-02T00:00:00.000Z")],
  beforeBatches: [row("old@example.com", "expired")],
};
const STOPPED_OVERVIEW = { stopped: true, canOpen: false, nextBatchNumber: 3, batches: [batch(2, null, "stopped"), batch(1, "2026-11-02T00:00:00.000Z", "stopped")], beforeBatches: [] };

type Reply = { status?: number; body: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { ok: true, data } });
const refused = (code: string, message: string, status = 409): Reply => ({ status, body: { ok: false, error: { code, message } } });

/** Routes `fetch` by method and path; each key holds the replies in order (the last one repeats). */
function stubApi(routes: Record<string, Reply[]>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    calls.push({ key, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const queue = routes[key];
    const reply = queue.length > 1 ? (queue.shift() as Reply) : queue[0];
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);

  return { calls, count: (key: string) => calls.filter((call) => call.key === key).length };
}

const GET = "GET /api/admin/invitation-batches";
const OPEN_BATCH = "POST /api/admin/invitation-batches";
const INVITE = "POST /api/admin/invitations";

function renderBoard() {
  return render(<InvitationsBoard tagOptions={TAGS} stoppedMessage={STOPPED} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvitationsBoard", () => {
  it("shows loading, then an error with Try again that reloads the overview", async () => {
    const api = stubApi({ [GET]: [refused("SERVICE_UNAVAILABLE", "Service unavailable.", 503), ok(EMPTY)] });
    renderBoard();

    expect(screen.getByText(/Loading/)).toBeTruthy();
    expect(await screen.findByText("Service unavailable.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No batches yet. Open the first batch to start inviting.")).toBeTruthy();
    expect(api.count(GET)).toBe(2);
  });

  it("opens batch 1 after confirming in the dialog and then shows the form", async () => {
    const api = stubApi({ [GET]: [ok(EMPTY), ok(OPEN)], [OPEN_BATCH]: [ok({ number: 1, openedAt: "2026-11-24T12:00:00.000Z" }, 201)] });
    renderBoard();

    await userEvent.click(await screen.findByRole("button", { name: "Open batch 1" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Open batch 1?")).toBeTruthy();
    expect(within(dialog).getByText("It takes up to 20 invitations.")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Open batch 1" }));

    expect(await screen.findByRole("button", { name: "Send invitation" })).toBeTruthy();
    expect(api.count(OPEN_BATCH)).toBe(1);
    expect(api.count(GET)).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancelling the dialog opens nothing", async () => {
    const api = stubApi({ [GET]: [ok(EMPTY)] });
    renderBoard();

    await userEvent.click(await screen.findByRole("button", { name: "Open batch 1" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.count(OPEN_BATCH)).toBe(0);
  });

  it("shows a refused open in the dialog's place and reloads the overview", async () => {
    const api = stubApi({ [GET]: [ok(FULL)], [OPEN_BATCH]: [refused("BATCH_ALREADY_OPEN", "A batch is already open.")] });
    renderBoard();

    expect(await screen.findByText("This batch is full. Open a new batch to invite more.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Open batch 2" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Open batch 2" }));

    expect((await screen.findByRole("alert")).textContent).toBe("A batch is already open.");
    await waitFor(() => expect(api.count(GET)).toBe(2));
  });

  it("shows the stop banner word for word with no form and no open button", async () => {
    stubApi({ [GET]: [ok(STOPPED_OVERVIEW)] });
    renderBoard();

    expect(await screen.findByText(STOPPED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send invitation" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Open batch/ })).toBeNull();
    expect(screen.getAllByText("Stopped")).toHaveLength(2);
  });

  it("lists every batch newest first and the invitations created before batches", async () => {
    stubApi({ [GET]: [ok(OPEN)] });
    renderBoard();

    await screen.findByRole("button", { name: "Send invitation" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Invite to batch 2",
      "Batch 2",
      "Batch 1",
      "Created before batches",
    ]);
    expect(screen.getByText("Expired, not accepted")).toBeTruthy();
  });

  it("refuses invalid input in the browser and sends nothing", async () => {
    const api = stubApi({ [GET]: [ok(OPEN)] });
    renderBoard();

    await userEvent.type(await screen.findByLabelText(/Email/), "anna");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Enter a valid email address, e.g. name@example.com.")).toBeTruthy();
    expect(screen.getByText("Pick at least one stack tag.")).toBeTruthy();
    expect(api.count(INVITE)).toBe(0);
  });

  it("sends an invitation, says so, clears the form and reloads the overview", async () => {
    const api = stubApi({
      [GET]: [ok(OPEN)],
      [INVITE]: [ok({ id: "i1", email: "anna@example.com", batchNumber: 2, sent: 2 }, 201)],
    });
    renderBoard();

    await userEvent.type(await screen.findByLabelText(/Email/), " Anna@Example.COM ");
    await userEvent.click(screen.getByRole("checkbox", { name: "React" }));
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect((await screen.findByRole("status")).textContent).toBe("Invitation sent to anna@example.com");
    expect(api.calls.find((call) => call.key === INVITE)?.body).toEqual({ email: "anna@example.com", stackTags: ["react"] });
    await waitFor(() => expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe(""));
    expect(api.count(GET)).toBe(2);
  });

  it("shows an address refusal under Email, keeps the typed values and does not reload", async () => {
    const api = stubApi({
      [GET]: [ok(OPEN)],
      [INVITE]: [refused("ALREADY_INVITED", "This email already has an unresolved invitation (pending or expired): resend or revoke it first.")],
    });
    renderBoard();

    const email = await screen.findByLabelText(/Email/);
    await userEvent.type(email, "anna@example.com");
    await userEvent.click(screen.getByRole("checkbox", { name: "React" }));
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    const message = await screen.findByText(/already has an unresolved invitation/);
    expect(message.closest('[data-field="email"]')).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((email as HTMLInputElement).value).toBe("anna@example.com");
    expect(api.count(GET)).toBe(1);
  });

  it("shows a batch refusal above the button and reloads the overview", async () => {
    const api = stubApi({
      [GET]: [ok(OPEN), ok(FULL)],
      [INVITE]: [refused("BATCH_FULL", "This batch is full; open a new batch.")],
    });
    renderBoard();

    await userEvent.type(await screen.findByLabelText(/Email/), "anna@example.com");
    await userEvent.click(screen.getByRole("checkbox", { name: "React" }));
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("This batch is full. Open a new batch to invite more.")).toBeTruthy();
    expect(api.count(GET)).toBe(2);
  });

  it("keeps the form error when the overview did not change (mail failure)", async () => {
    stubApi({
      [GET]: [ok(OPEN)],
      [INVITE]: [refused("INVITATION_MAIL_FAILED", "The invitation email could not be sent. Nothing was saved; try again.", 503)],
    });
    renderBoard();

    await userEvent.type(await screen.findByLabelText(/Email/), "anna@example.com");
    await userEvent.click(screen.getByRole("checkbox", { name: "React" }));
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("The invitation email could not be sent. Nothing was saved; try again.")).toBeTruthy();
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("anna@example.com");
  });

  it("ignores an overview that arrives after unmount", async () => {
    let resolve: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => (resolve = done))));
    const { unmount } = renderBoard();
    unmount();

    await act(async () => {
      resolve(new Response(JSON.stringify({ ok: true, data: EMPTY }), { headers: { "content-type": "application/json" } }));
    });

    expect(screen.queryByText(/No batches yet/)).toBeNull();
  });
});
