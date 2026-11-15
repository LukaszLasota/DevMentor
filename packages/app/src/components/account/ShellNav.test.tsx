import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

const { ShellNav } = await import("./ShellNav");

describe("ShellNav", () => {
  it("marks the link of the open page as current", () => {
    render(
      <ShellNav
        sections={[
          { items: [{ href: "/mentors", label: "Mentors" }] },
          { label: "Admin", items: [{ href: "/admin", label: "Dashboard" }] },
        ]}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Mentors" }).getAttribute("aria-current")).toBeNull();
  });
});
