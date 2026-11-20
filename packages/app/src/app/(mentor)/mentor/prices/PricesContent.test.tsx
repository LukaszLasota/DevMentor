import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SETTINGS = { currency: "PLN", bounds: { "25": { minCents: 5000, maxCents: 30000 }, "50": { minCents: 10000, maxCents: 60000 } } };
const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn(), findOwn: vi.fn(), tryGet: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
// Money formatting is core's (tested there); a stand-in with the same output keeps this test in app.
vi.mock("@devmentor/core", () => ({
  allowedRange: (bounds: { minCents: number; maxCents: number }, currency: string) =>
    `Allowed: ${currency} ${(bounds.minCents / 100).toFixed(2)}–${currency} ${(bounds.maxCents / 100).toFixed(2)}`,
  toMajorString: (cents: number) => (cents / 100).toFixed(2),
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) =>
    fn({ mentorProfileService: { findOwn: mocks.findOwn }, platformSettingsService: { tryGet: mocks.tryGet } }),
}));
vi.mock("./PricesForm", () => ({
  PricesForm: (props: { currency: string; ranges: Record<string, string>; initial: Record<string, string> }) => (
    <div data-testid="form">{JSON.stringify(props).replace(/\s/g, " ")}</div>
  ),
}));

const { PricesContent } = await import("./PricesContent");

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u1", roles: ["mentee", "mentor"] });
  mocks.findOwn.mockReset().mockResolvedValue({ prices: null });
  mocks.tryGet.mockReset().mockReturnValue(SETTINGS);
});

describe("PricesContent", () => {
  it("guards /mentor/prices and hands the form the currency, the ranges and empty values", async () => {
    render(await PricesContent());

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor/prices", "mentor");
    expect(JSON.parse(screen.getByTestId("form").textContent as string)).toEqual({
      currency: "PLN",
      ranges: { price25: "Allowed: PLN 50.00–PLN 300.00", price50: "Allowed: PLN 100.00–PLN 600.00" },
      initial: { price25: "", price50: "" },
    });
  });

  it("prefills stored prices as exact major-unit strings", async () => {
    mocks.findOwn.mockResolvedValue({ prices: { price25Cents: 15000, price50Cents: 30050, currency: "PLN" } });

    render(await PricesContent());

    expect(JSON.parse(screen.getByTestId("form").textContent as string).initial).toEqual({ price25: "150.00", price50: "300.50" });
  });

  it("fails closed without settings: a message and no form", async () => {
    mocks.tryGet.mockReturnValue(null);

    render(await PricesContent());

    expect(screen.getByText("Prices cannot be set right now")).toBeTruthy();
    expect(screen.queryByTestId("form")).toBeNull();
  });

  it("explains a missing profile", async () => {
    mocks.findOwn.mockResolvedValue(null);

    render(await PricesContent());

    expect(screen.getByText("You have no mentor page yet")).toBeTruthy();
  });

  it("reads nothing when the guard redirects", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(PricesContent()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.findOwn).not.toHaveBeenCalled();
  });
});
