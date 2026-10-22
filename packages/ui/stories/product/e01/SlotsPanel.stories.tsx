import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { SlotsPanel } from "../../../src";

const upcoming = [
  { id: "a", startsAt: "2026-11-05T09:00:00Z", meetsLeadTime: false },
  { id: "b", startsAt: "2026-11-05T17:30:00Z", meetsLeadTime: true },
  { id: "c", startsAt: "2026-11-06T08:00:00Z", meetsLeadTime: true },
];

const meta = {
  title: "Product/E01 Mentor onboarding/Slots panel",
  component: SlotsPanel,
  args: { slots: upcoming, showPast: false, onShowPastChange: fn(), onRemove: fn() },
  decorators: [(Story) => <div className="max-w-measure">{Story()}</div>],
} satisfies Meta<typeof SlotsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Upcoming: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Less than 2 h away")).toBeVisible();
  },
};

export const Empty: Story = { args: { slots: [] } };

export const WithPast: Story = {
  args: {
    showPast: true,
    slots: [...upcoming, { id: "p", startsAt: "2026-10-20T09:00:00Z", meetsLeadTime: false, past: true }],
  },
};

export const ManySlots: Story = {
  args: {
    slots: Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      startsAt: new Date(Date.UTC(2026, 10, 5 + i, 17, 30)).toISOString(),
      meetsLeadTime: true,
    })),
  },
};

export const NarrowScreen: Story = { decorators: [(Story) => <div className="w-phone">{Story()}</div>] };
