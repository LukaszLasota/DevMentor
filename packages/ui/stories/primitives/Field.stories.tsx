import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Field, Input } from "../../src";

const meta = {
  title: "Primitives/Field",
  component: Field,
  args: {
    label: "Price for 50 minutes",
    hint: "Within the bounds set by the operator",
    required: true,
    children: (control) => <Input {...control} inputMode="decimal" className="font-mono tabular-nums" />,
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText(/Price for 50 minutes/);
    await expect(input).toBeRequired();
    await expect(input).toHaveAccessibleDescription("Within the bounds set by the operator");
  },
};

export const WithError: Story = {
  args: { error: "Enter a price between the operator's bounds, for example 120." },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText(/Price for 50 minutes/);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      "Within the bounds set by the operator Enter a price between the operator's bounds, for example 120.",
    );
  },
};

export const Optional: Story = {
  args: { label: "Public work link", hint: undefined, required: false, optional: true, children: (control) => <Input {...control} type="url" /> },
};

export const LongLabelNarrowScreen: Story = {
  args: {
    label: "Link to something you built, wrote or presented that shows how you work",
    hint: "A repository, article or talk. Mentees choose by public work, not by ratings.",
  },
  render: (args) => (
    <div className="w-phone">
      <Field {...args} />
    </div>
  ),
};
