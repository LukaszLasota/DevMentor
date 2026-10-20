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
        <Button asChild variant="link">
          <a href="/x">Link</a>
        </Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Save" }).className).toContain("extra");
    expect(screen.getByRole("link", { name: "Link" }).getAttribute("data-slot")).toBe("button");
    expect(buttonVariants({ variant: "destructive", size: "lg" })).toContain("bg-destructive");
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
