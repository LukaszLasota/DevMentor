import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { LocalTime, MentorListSkeleton } from "../../../src/mentors";

const meta = {
  title: "Product/E02 Finding a mentor/Loading and time",
  component: MentorListSkeleton,
} satisfies Meta<typeof MentorListSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListLoading: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status", { name: "Loading mentors" })).toHaveAttribute("aria-busy", "true");
  },
};

export const LocalTimeInViewerZone: Story = {
  render: () => (
    <p className="text-body-small">
      Next open time: <LocalTime iso="2026-11-05T17:30:00Z" />
    </p>
  ),
};
