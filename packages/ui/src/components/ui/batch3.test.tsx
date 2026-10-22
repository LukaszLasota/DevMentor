import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
} from "./alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

describe("batch 3 primitives", () => {
  it("Dialog opens with a title, description and a labelled close button", async () => {
    render(
      <Dialog>
        <DialogTrigger>Edit prices</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your prices</DialogTitle>
            <DialogDescription>Within the operator bounds</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit prices" }));
    const dialog = screen.getByRole("dialog", { name: "Your prices" });
    expect(dialog.getAttribute("data-slot")).toBe("dialog-content");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Dialog can hide its close icon", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false} aria-describedby={undefined}>
          <DialogTitle>Share link</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("Confirm dialog focuses Cancel first and runs the destructive action", async () => {
    const onRemove = vi.fn();
    render(
      <AlertDialog>
        <AlertDialogTrigger>Remove</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the slot on 14 Nov, 18:30?</AlertDialogTitle>
            <AlertDialogDescription>Mentees will no longer see it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep slot</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Remove slot</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep slot" }));
    const action = screen.getByRole("button", { name: "Remove slot" });
    expect(action.getAttribute("data-intent")).toBe("destructive");
    await userEvent.click(action);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("Menu lists actions, including a destructive one", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>marta@example.com</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>Resend invitation</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Revoke invitation</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Revoke invitation" }).getAttribute("data-variant")).toBe("destructive");
    expect(screen.getByRole("menuitem", { name: "Resend invitation" }).getAttribute("data-variant")).toBe("default");
  });
});
