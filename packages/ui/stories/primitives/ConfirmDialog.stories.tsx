import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "../../src";

const meta = {
  title: "Primitives/Confirm dialog",
  component: AlertDialog,
  args: { onRemove: fn() },
  render: (args: { onRemove?: () => void; defaultOpen?: boolean }) => (
    <AlertDialog defaultOpen={args.defaultOpen}>
      <AlertDialogTrigger asChild>
        <Button intent="destructive" size="sm">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the slot on Thu 14 Nov, 18:30?</AlertDialogTitle>
          <AlertDialogDescription>Mentees will no longer see this time on your page.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep slot</AlertDialogCancel>
          <AlertDialogAction onClick={args.onRemove}>Remove slot</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog", { name: /Remove the slot/ });
    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep slot" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Remove slot" }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
  },
};

export const Open: Story = {
  args: { defaultOpen: true },
};
