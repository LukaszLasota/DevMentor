import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
} from "../../src";

function PricesDialog({ open }: { open?: boolean }) {
  return (
    <Dialog defaultOpen={open}>
      <DialogTrigger asChild>
        <Button>Edit prices</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your prices</DialogTitle>
          <DialogDescription>Set a price for each session length within the operator bounds.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-paragraph">
          <Field label="Price for 25 minutes" required>
            {(control) => <Input {...control} inputMode="decimal" className="font-mono tabular-nums" />}
          </Field>
          <Field label="Price for 50 minutes" required>
            {(control) => <Input {...control} inputMode="decimal" className="font-mono tabular-nums" />}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button intent="primary" appearance="filled">
            Save prices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: "Primitives/Dialog",
  component: Dialog,
  render: () => <PricesDialog />,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Edit prices" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Your prices" });
    await waitFor(() => expect(dialog).toBeVisible());
    await waitFor(() => expect(screen.getByLabelText(/Price for 25 minutes/)).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(trigger).toHaveFocus();
  },
};

export const Open: Story = {
  render: () => <PricesDialog open />,
};
