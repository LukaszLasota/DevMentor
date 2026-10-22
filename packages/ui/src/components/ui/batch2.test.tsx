import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Badge, badgeVariants } from "./badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Skeleton } from "./skeleton";

// Smoke tests for the stage-2 batch-2 primitives: slots, tones and accessibility attributes.
describe("batch 2 primitives", () => {
  it("Badge shows an icon and a word for every tone and supports asChild", () => {
    render(
      <>
        <Badge>Draft</Badge>
        <Badge tone="success">Published</Badge>
        <Badge tone="warning">Not bookable yet</Badge>
        <Badge tone="danger">Expired</Badge>
        <Badge asChild tone="success">
          <a href="/x">Connected</a>
        </Badge>
      </>,
    );

    expect(screen.getByText("Published").dataset.tone).toBe("success");
    expect(screen.getByText("Expired").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("link", { name: "Connected" }).getAttribute("data-slot")).toBe("badge");
    expect(badgeVariants({ tone: "warning" })).toContain("text-warning");
  });

  it("Badge with a null tone falls back to the neutral icon", () => {
    render(<Badge tone={null}>Draft</Badge>);
    expect(screen.getByText("Draft").querySelector("svg")).not.toBeNull();
  });

  it("Alert is a status region, or an alert when it reports a danger", () => {
    render(
      <>
        <Alert>
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>We sent a link to set your password.</AlertDescription>
        </Alert>
        <Alert tone="danger">
          <AlertTitle>Invitation expired</AlertTitle>
        </Alert>
      </>,
    );

    expect(screen.getByRole("status").dataset.tone).toBe("neutral");
    expect(screen.getByRole("alert").textContent).toBe("Invitation expired");
  });

  it("Avatar renders the initial fallback in every size", () => {
    render(
      <>
        <Avatar size="lg">
          <AvatarImage src="" alt="" />
          <AvatarFallback>M</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>K</AvatarFallback>
        </Avatar>
      </>,
    );

    expect(screen.getByText("M").getAttribute("data-slot")).toBe("avatar-fallback");
    expect(screen.getByText("K").closest("[data-slot=avatar]")?.getAttribute("data-size")).toBe("md");
  });

  it("Card renders every part", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Your prices</CardTitle>
          <CardDescription>Within the operator bounds</CardDescription>
          <CardAction>Edit</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    const slots = [...container.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot"));
    expect(slots).toEqual(["card", "card-header", "card-title", "card-description", "card-action", "card-content", "card-footer"]);
  });

  it("Skeleton is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("Select renders an open list with groups, labels and a separator", () => {
    render(
      <Select open defaultValue="react">
        <SelectTrigger aria-label="Stack tag" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectScrollUpButton />
          <SelectGroup>
            <SelectLabel>Stack tags</SelectLabel>
            <SelectItem value="typescript">TypeScript</SelectItem>
            <SelectItem value="react">React</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectScrollDownButton />
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole("combobox", { name: "Stack tag", hidden: true }).getAttribute("data-size")).toBe("sm");
    expect(screen.getByRole("option", { name: "React" }).getAttribute("data-state")).toBe("checked");
    expect(screen.getByText("Stack tags").getAttribute("data-slot")).toBe("select-label");
  });
});
