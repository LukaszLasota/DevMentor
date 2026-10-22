import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table";
import { Textarea } from "./textarea";

// Smoke tests for generated shadcn/ui primitives: they render with their data-slot
// and merge custom classes.
describe("shadcn primitives", () => {
  it("Button renders a button by default and its child with asChild", () => {
    render(
      <>
        <Button className="extra">Save</Button>
        <Button asChild appearance="text">
          <a href="/x">Link</a>
        </Button>
      </>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("extra");
    expect(button.dataset).toMatchObject({ intent: "neutral", appearance: "outline", size: "md" });
    expect(screen.getByRole("link", { name: "Link" }).getAttribute("data-slot")).toBe("button");
    expect(buttonVariants({ intent: "destructive", appearance: "filled", size: "lg" })).toContain("bg-destructive");
    expect(buttonVariants({ iconOnly: true, size: "sm" })).toContain("w-button-sm");
  });

  it("Button in loading state is disabled, busy and announces its label", () => {
    render(
      <Button intent="primary" appearance="filled" loading loadingLabel="Saving…">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: /Save/ });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Saving…");
  });

  it("Button with asChild marks a disabled child with aria-disabled instead of disabled", () => {
    render(
      <>
        <Button asChild disabled>
          <a href="/off">Off</a>
        </Button>
        <Button asChild>
          <a href="/on">On</a>
        </Button>
      </>,
    );

    expect(screen.getByRole("link", { name: "Off" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("link", { name: "On" }).hasAttribute("aria-disabled")).toBe(false);
  });

  it("Input, Textarea and Label render with their slots", () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" className="extra" />
        <Textarea aria-label="Bio" className="extra" />
      </>,
    );

    expect(screen.getByLabelText("Name").getAttribute("data-slot")).toBe("input");
    expect(screen.getByLabelText("Bio").getAttribute("data-slot")).toBe("textarea");
    expect(screen.getByLabelText("Bio").className).toContain("extra");
  });

  it("Table renders every part", () => {
    const { container } = render(
      <Table>
        <TableCaption>Caption</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Head</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    const slots = [...container.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot"));
    expect(new Set(slots)).toEqual(
      new Set([
        "table-container",
        "table",
        "table-caption",
        "table-header",
        "table-row",
        "table-head",
        "table-body",
        "table-cell",
        "table-footer",
      ]),
    );
  });
});
