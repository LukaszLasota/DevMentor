import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Avatar, AvatarFallback, AvatarImage } from "../../src";

const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  args: { size: "md" },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md", "lg"] } },
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src="" alt="" />
      <AvatarFallback>M</AvatarFallback>
    </Avatar>
  ),
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("M")).toBeVisible();
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-paragraph">
      {(["sm", "md", "lg"] as const).map((size) => (
        <Avatar key={size} size={size}>
          <AvatarFallback>K</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};

export const WithName: Story = {
  render: () => (
    <div className="flex items-center gap-related">
      <Avatar aria-hidden="true">
        <AvatarFallback>M</AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="text-label font-medium">Marta Kowal</span>
        <span className="text-caption text-muted-foreground">Platform engineer · Kubernetes, Helm</span>
      </div>
    </div>
  ),
};
