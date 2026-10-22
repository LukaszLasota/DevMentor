import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { TextLink } from "../../src";

const meta = {
  title: "Primitives/Text link",
  component: TextLink,
  args: { href: "#mentors", children: "Find a mentor" },
} satisfies Meta<typeof TextLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Find a mentor" });
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await expect(link).toHaveAttribute("href", "#mentors");
  },
};

export const InRunningText: Story = {
  render: () => (
    <p className="max-w-measure text-body">
      No share link yet? <TextLink href="#mentors">Browse mentors by stack tag</TextLink> — mentors who most recently
      published open times come first.
    </p>
  ),
};

export const External: Story = {
  args: { href: "https://github.com/kubernetes/ingress-nginx/pull/12345", external: true, children: "Public work" },
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: /Public work/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  },
};

export const StateMatrix: Story = {
  render: () => (
    <div className="flex flex-wrap gap-component">
      {(["default", "hover", "focus"] as const).map((state) => (
        <div key={state} className="flex flex-col gap-related">
          <span className="text-caption text-muted-foreground">{state}</span>
          <TextLink href="#mentors" data-preview-state={state} tabIndex={-1}>
            Find a mentor
          </TextLink>
        </div>
      ))}
    </div>
  ),
};

export const LongTextNarrowScreen: Story = {
  render: () => (
    <p className="w-phone text-body">
      Read <TextLink href="#note">how to prepare your question before a 25-minute text session with a mentor</TextLink>.
    </p>
  ),
};
