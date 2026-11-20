import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PricesForm } from "./PricesForm";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const RANGES = { price25: "Allowed: PLN 50.00–PLN 300.00", price50: "Allowed: PLN 100.00–PLN 600.00" };
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderForm(initial = { price25: "", price50: "" }) {
  render(<PricesForm currency="PLN" ranges={RANGES} initial={initial} />);

  return userEvent.setup();
}

describe("PricesForm", () => {
  it("shows both fields with the currency, the allowed ranges and a decimal keyboard", () => {
    renderForm({ price25: "150.00", price50: "300.00" });

    const field = screen.getByLabelText("25 minutes") as HTMLInputElement;
    expect(field.value).toBe("150.00");
    expect(field.getAttribute("inputmode")).toBe("decimal");
    expect(screen.getAllByText("PLN")).toHaveLength(2);
    expect(screen.getByText(RANGES.price25)).toBeTruthy();
    expect(screen.getByText(RANGES.price50)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(book now|ratings?|reviews?)\b/i);
  });

  it("saves both prices together and refreshes server views", async () => {
    const user = renderForm();
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true, data: {} }));

    await user.type(screen.getByLabelText("25 minutes"), "150");
    await user.type(screen.getByLabelText("50 minutes"), "300.50");
    await user.click(screen.getByRole("button", { name: "Save prices" }));

    expect(await screen.findByText("Prices saved.")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, init.method]).toEqual(["/api/mentors/me/prices", "PUT"]);
    expect(JSON.parse(init.body as string)).toEqual({ price25: "150", price50: "300.50" });
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses a malformed amount on the client and shows the server's range per field", async () => {
    const user = renderForm();
    await user.type(screen.getByLabelText("25 minutes"), "1e3");
    await user.type(screen.getByLabelText("50 minutes"), "300");
    await user.click(screen.getByRole("button", { name: "Save prices" }));
    expect(screen.getByText("Enter an amount like 150 or 150.50.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      respond(400, {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "A price is outside the allowed range; nothing was saved.",
          fieldErrors: { price50: [RANGES.price50] },
        },
      }),
    );
    await user.clear(screen.getByLabelText("25 minutes"));
    await user.type(screen.getByLabelText("25 minutes"), "150");
    await user.clear(screen.getByLabelText("50 minutes"));
    await user.type(screen.getByLabelText("50 minutes"), "9000");
    await user.click(screen.getByRole("button", { name: "Save prices" }));

    expect(await screen.findByText("A price is outside the allowed range; nothing was saved.")).toBeTruthy();
    expect(screen.getByLabelText("50 minutes").getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Prices saved.")).toBeNull();
  });
});
