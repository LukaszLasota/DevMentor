import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import { CopyShareLink, ProfileActions } from "../../../src";

const meta = {
  title: "Product/E01 Mentor onboarding/Publish and share",
  component: ProfileActions,
  args: { published: false, onPublish: fn(), onUnpublish: fn() },
} satisfies Meta<typeof ProfileActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotPublished: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Publish" }));
    await expect(args.onPublish).toHaveBeenCalledOnce();
  },
};

export const Publishing: Story = { args: { busy: true } };

export const Published: Story = {
  args: { published: true },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep it published" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Unpublish page" }));
    await expect(args.onUnpublish).toHaveBeenCalledOnce();
  },
};

export const ShareLink: Story = {
  render: () => (
    <div className="max-w-measure">
      <CopyShareLink url="https://devmentor.example/m/marta-kowal" />
    </div>
  ),
};

export const ShareLinkNarrowScreen: Story = {
  render: () => (
    <div className="w-72">
      <CopyShareLink url="https://devmentor.example/m/aleksandra-nowakowska-wisniewska" />
    </div>
  ),
};
