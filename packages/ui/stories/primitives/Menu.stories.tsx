import type { Meta, StoryObj } from "@storybook/react-vite";
import { Ellipsis } from "lucide-react";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../src";

function RowActions({ open }: { open?: boolean }) {
  // Open by default only for the docs preview; non-modal so the rest of the story stays readable to axe.
  return (
    <DropdownMenu defaultOpen={open} modal={!open}>
      <DropdownMenuTrigger asChild>
        <Button appearance="text" size="sm" iconOnly aria-label="Actions for marta@example.com">
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>marta@example.com</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>Resend invitation</DropdownMenuItem>
          <DropdownMenuItem disabled>Open mentor page</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Revoke invitation</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: "Primitives/Menu",
  component: DropdownMenu,
  render: () => <RowActions />,
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Actions for marta@example.com" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Resend invitation" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await expect(screen.getByRole("menuitem", { name: "Revoke invitation" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const Open: Story = {
  render: () => (
    <div className="flex justify-end pb-section">
      <RowActions open />
    </div>
  ),
};
