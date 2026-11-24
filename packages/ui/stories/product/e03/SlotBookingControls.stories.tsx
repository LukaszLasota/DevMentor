import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { MentorPageView, SlotBookingControls, type BookingLength } from "../../../src/mentors";
import { marta, prices, slots } from "../fixtures";

const PRICES = { "25": "PLN 150.00", "50": "PLN 300.00" };

const meta = {
  title: "Product/E03 Booking/Slot booking controls",
  component: SlotBookingControls,
  args: { lengths: ["25", "50"], prices: PRICES, timeLabel: "Thu 5 Nov, 18:30", onBook: fn<(length: BookingLength) => Promise<string | null>>(async () => null) },
} satisfies Meta<typeof SlotBookingControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BothLengths: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("radio", { name: "25 min PLN 150.00" })).toBeChecked();
    await userEvent.click(canvas.getByRole("radio", { name: "50 min PLN 300.00" }));
    await userEvent.click(canvas.getByRole("button", { name: "Book" }));
    await expect(args.onBook).toHaveBeenCalledWith("50");
    await expect(canvas.getByRole("button", { name: "Opening payment…" })).toHaveAttribute("aria-disabled", "true");
  },
};

/** #79: the second length chosen with the keyboard — filled dot and primary border move with the choice. */
export const FiftySelected: Story = {
  play: async ({ canvas }) => {
    canvas.getByRole("radio", { name: "25 min PLN 150.00" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("radio", { name: "50 min PLN 300.00" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "25 min PLN 150.00" })).not.toBeChecked();
  },
};

/** A 50-minute session would run into the next booking, so only 25 is offered. */
export const OnlyShortLength: Story = { args: { lengths: ["25"] } };

export const Taken: Story = {
  args: { onBook: fn<(length: BookingLength) => Promise<string | null>>(async () => "This time was just taken. Pick another one.") },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Book" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("This time was just taken.");
  },
};

/** The share page with booking controls on each open time (spec #29). */
export const OnTheMentorPage: StoryObj<typeof MentorPageView> = {
  render: () => (
    <MentorPageView
      {...marta}
      offerReady
      prices={prices}
      slots={slots}
      renderSlotAction={(slot) => (
        <SlotBookingControls lengths={slot.bookableLengths} prices={PRICES} timeLabel={slot.startsAt} onBook={async () => null} />
      )}
    />
  ),
};

export const NarrowScreen: Story = {
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};
