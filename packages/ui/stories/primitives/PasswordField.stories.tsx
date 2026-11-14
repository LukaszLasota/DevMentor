import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent } from "storybook/test";
import { PasswordField, type PasswordFieldProps } from "../../src";

function Controlled(props: Omit<PasswordFieldProps, "value" | "onChange">) {
  const [value, setValue] = useState("correct horse battery");
  return <PasswordField {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: "Primitives/Password field",
  component: Controlled,
  args: { label: "New password", hint: "12 to 128 characters.", required: true },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default (DS-02, L05)",
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText(/New password/);
    await expect(input).toHaveAttribute("type", "password");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show password" }));
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("correct horse battery");
  },
};

export const WithError: Story = {
  args: { error: "Password must be at least 12 characters." },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/New password/)).toHaveAttribute("aria-invalid", "true");
  },
};

export const Dark: Story = { globals: { theme: "dark" } };

export const NarrowScreen: Story = {
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};
