import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { RoleNotice } from "../../../src";

const meta = {
  title: "Product/E01 Mentor onboarding/Role notice",
  component: RoleNotice,
  args: { notice: "mentor_only" },
} satisfies Meta<typeof RoleNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MentorOnly: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("This page is for mentors.");
  },
};
export const OperatorOnly: Story = { args: { notice: "operator_only" } };
