import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ReadinessChecklist } from "../../../src";

const meta = {
  title: "Product/E01 Mentor onboarding/Readiness checklist",
  component: ReadinessChecklist,
  args: {
    title: "Before you can publish",
    items: [
      { key: "displayName", label: "Display name", met: true },
      { key: "publicWorkUrl", label: "Link to your public work", met: true },
      { key: "bio", label: "What you have done", met: false, href: "#bio", actionLabel: "Write it" },
      { key: "stackTags", label: "At least one stack tag", met: false, href: "#tags", actionLabel: "Pick tags" },
    ],
  },
  decorators: [(Story) => <div className="max-w-measure">{Story()}</div>],
} satisfies Meta<typeof ReadinessChecklist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partial: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 of 4 done")).toBeVisible();
  },
};

export const MentorHome: Story = {
  args: {
    title: "Publish at least one bookable session by Thu 5 Nov",
    items: [
      { key: "published", label: "Publish your page", met: true },
      {
        key: "price50",
        label: "Set your prices",
        met: false,
        href: "#prices",
        actionLabel: "Set prices",
        detail: "Your 50-minute price $200.00 is above the allowed $150.00 — save a new price",
      },
      { key: "hasBookableSlot", label: "Publish a slot", met: false, href: "#slots", actionLabel: "Add a slot" },
    ],
  },
};

export const AllDone: Story = {
  args: {
    items: [
      { key: "displayName", label: "Display name", met: true },
      { key: "publicWorkUrl", label: "Link to your public work", met: true },
      { key: "bio", label: "What you have done", met: true },
      { key: "stackTags", label: "At least one stack tag", met: true },
    ],
  },
};

export const NarrowScreen: Story = {
  args: MentorHome.args,
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};
