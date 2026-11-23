import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SlotBookingControls, type BookingLength } from "./SlotBookingControls";

const PRICES = { "25": "PLN 150.00", "50": "PLN 300.00" };

function setup(lengths: BookingLength[] = ["25", "50"], onBook = vi.fn<(length: BookingLength) => Promise<string | null>>(async () => null)) {
  render(<SlotBookingControls lengths={lengths} prices={PRICES} timeLabel="Tue 11:00" onBook={onBook} />);

  return { onBook };
}

describe("SlotBookingControls", () => {
  it("shows each bookable length with its price before paying, the first one chosen (AC1)", () => {
    setup();

    const group = screen.getByRole("group", { name: "Length for Tue 11:00" });
    expect(group.textContent).toBe("Length25 min PLN 150.0050 min PLN 300.00");
    expect((screen.getByRole("radio", { name: "25 min PLN 150.00" }) as HTMLInputElement).checked).toBe(true);
  });

  it("reads as a choice: a visible Length caption and a radio dot per option, keyboard selection works (#79)", () => {
    setup();

    expect(screen.getByText("Length").getAttribute("aria-hidden")).toBe("true");
    const fifty = screen.getByRole("radio", { name: "50 min PLN 300.00" }) as HTMLInputElement;
    expect(fifty.closest("label")?.querySelectorAll('span[aria-hidden="true"].rounded-full')).toHaveLength(1);
    fireEvent.click(fifty);
    expect(fifty.checked).toBe(true);
    expect((screen.getByRole("radio", { name: "25 min PLN 150.00" }) as HTMLInputElement).checked).toBe(false);
  });

  it("offers only the free lengths", () => {
    setup(["25"]);

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByText("PLN 300.00")).toBeNull();
  });

  it("renders nothing without a free length", () => {
    const { container } = render(<SlotBookingControls lengths={[]} prices={PRICES} timeLabel="t" onBook={vi.fn()} />);

    expect(container.innerHTML).toBe("");
  });

  it("books the chosen length and stays busy while the browser leaves for payment", async () => {
    const { onBook } = setup();

    fireEvent.click(screen.getByRole("radio", { name: "50 min PLN 300.00" }));
    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    expect(onBook).toHaveBeenCalledWith("50");
    const busy = await screen.findByRole("button", { name: "Opening payment…" });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(busy);
    expect(onBook).toHaveBeenCalledOnce();
    expect((screen.getByRole("radio", { name: "25 min PLN 150.00" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("shows the refusal under the time and lets the mentee try again", async () => {
    const onBook = vi.fn(async (): Promise<string | null> => "This time was just taken. Pick another one.");
    setup(["25", "50"], onBook);

    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    expect((await screen.findByRole("alert")).textContent).toBe("This time was just taken. Pick another one.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Book" }).getAttribute("aria-disabled")).toBeNull());
  });

  it("promises no response time (R09)", () => {
    setup();

    expect(document.body.textContent).not.toMatch(/respond|reply|guarantee|within/i);
  });
});
