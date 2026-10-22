import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Skeleton } from "../../src";

function MentorRowSkeleton() {
  return (
    <div className="flex items-center gap-related border-b border-border py-related">
      <Skeleton className="size-avatar-md rounded-full" />
      <div className="flex flex-1 flex-col gap-related">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  render: () => (
    <div role="status" aria-label="Loading mentors" className="max-w-measure">
      {[1, 2, 3].map((i) => (
        <MentorRowSkeleton key={i} />
      ))}
    </div>
  ),
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status", { name: "Loading mentors" })).toBeVisible();
  },
};

export const NarrowScreen: Story = {
  render: () => (
    <div role="status" aria-label="Loading mentors" className="w-phone">
      <MentorRowSkeleton />
    </div>
  ),
};
