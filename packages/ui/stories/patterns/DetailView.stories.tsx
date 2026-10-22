import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ErrorMessage } from "../../src";
import { MentorPageView } from "../../src/mentors";
import { marta, prices, slots } from "../product/fixtures";

const meta = {
  title: "Patterns/Detail view",
  component: MentorPageView,
  args: { ...marta, offerReady: true, prices, slots },
} satisfies Meta<typeof MentorPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(canvas.getByRole("list", { name: "Session prices" })).toBeVisible();
  },
};
export const NotBookableYet: Story = { args: { offerReady: false, prices: null, slots: [] } };
export const NotFound: Story = {
  render: () => (
    <main className="flex max-w-measure flex-col gap-related">
      <h1 className="text-heading-2 font-semibold">Page not found</h1>
      <p className="text-body-small text-muted-foreground">
        This mentor page does not exist or is not published. <a className="text-link underline underline-offset-4" href="/mentors">Find a mentor</a>
      </p>
    </main>
  ),
};
export const LoadError: Story = {
  render: () => (
    <ErrorMessage message="This mentor page cannot be shown right now. Try again in a minute." onRetry={() => undefined} />
  ),
};
