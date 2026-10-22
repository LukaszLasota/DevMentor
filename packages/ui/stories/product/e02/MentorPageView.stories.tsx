import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { MentorPageView } from "../../../src/mentors";
import { longTexts, manySlots, marta, prices, slots } from "../fixtures";

const meta = {
  title: "Product/E02 Finding a mentor/Mentor page view",
  component: MentorPageView,
  args: { ...marta, offerReady: true, prices, slots },
} satisfies Meta<typeof MentorPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OfferReady: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Marta Kowal");
    await expect(canvas.getByText("Starts in less than two hours — no longer bookable")).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const NotBookableYet: Story = {
  args: { offerReady: false, prices: null, slots: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not bookable yet")).toBeVisible();
    await expect(canvas.queryByText(/\$/)).toBeNull();
  },
};

export const ManyOpenTimes: Story = { args: { slots: manySlots } };

export const LongTexts: Story = {
  args: { ...longTexts, offerReady: true, prices, slots },
};

export const NarrowScreen: Story = {
  args: { ...longTexts, offerReady: true, prices, slots },
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};
