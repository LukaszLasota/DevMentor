import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Badge } from "../../src";

const meta = {
  title: "Primitives/Status badge",
  component: Badge,
  args: { children: "Published", tone: "success" },
  argTypes: { tone: { control: "inline-radio", options: ["neutral", "success", "warning", "danger"] } },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const badge = canvas.getByText("Published");
    await expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  },
};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-related">
      <Badge>Draft</Badge>
      <Badge tone="success">Published</Badge>
      <Badge tone="success">Connected</Badge>
      <Badge tone="warning">Not bookable yet</Badge>
      <Badge tone="danger">Invitation expired</Badge>
    </div>
  ),
};

export const LongLabelNarrowScreen: Story = {
  render: () => (
    <div className="w-72">
      <Badge tone="warning">Payouts held until Stripe is enabled</Badge>
    </div>
  ),
};
