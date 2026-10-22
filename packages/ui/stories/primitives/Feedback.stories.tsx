import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { Button, EmptyState, ErrorMessage, LoadingMessage } from "../../src";

const meta = {
  title: "Primitives/Feedback states",
  component: EmptyState,
  args: { title: "No open times yet" },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => (
    <EmptyState
      title="No open times yet"
      description="Publish your first slot so mentees can book you."
      action={
        <Button intent="primary" appearance="filled" size="sm">
          Publish slot
        </Button>
      }
    />
  ),
};

const onRetry = fn();

export const Error: Story = {
  render: () => <ErrorMessage title="Could not load mentors" message="The server did not answer in time." onRetry={onRetry} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Could not load mentors");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(onRetry).toHaveBeenCalledOnce();
  },
};

export const ErrorWithoutTitle: Story = {
  render: () => <ErrorMessage message="Database is unreachable." />,
};

export const Loading: Story = {
  render: () => <LoadingMessage label="Loading open times…" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading open times…");
  },
};

export const NarrowScreen: Story = {
  render: () => (
    <div className="flex w-phone flex-col gap-paragraph">
      <EmptyState title="No mentors for this tag yet" description="Mentors appear here once they publish open times." />
      <ErrorMessage message="Could not load mentors. The server did not answer in time." onRetry={() => undefined} />
    </div>
  ),
};
