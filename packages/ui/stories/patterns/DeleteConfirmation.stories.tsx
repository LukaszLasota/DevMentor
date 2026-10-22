import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import { SlotsPanel } from "../../src";

const meta = {
  title: "Patterns/Delete confirmation",
  component: SlotsPanel,
  args: {
    slots: [{ id: "b", startsAt: "2026-11-05T17:30:00Z", meetsLeadTime: true }],
    showPast: false,
    onShowPastChange: fn(),
    onRemove: fn(),
  },
  decorators: [(Story) => <div className="max-w-measure">{Story()}</div>],
} satisfies Meta<typeof SlotsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RemoveSlot: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Remove slot/ }));
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(dialog).toHaveAccessibleName(/Remove the slot on/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep slot" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Remove slot" }));
    await expect(args.onRemove).toHaveBeenCalledWith("b");
  },
};

export const KeepSlot: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Remove slot/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep slot" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expect(args.onRemove).not.toHaveBeenCalled();
  },
};
