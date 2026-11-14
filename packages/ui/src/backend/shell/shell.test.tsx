import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";
import { currentHref, SideNav, type SideNavSection } from "./SideNav";

const sections: SideNavSection[] = [
  { items: [{ href: "/mentors", label: "Mentors" }, { href: "/mentor", label: "Mentor workspace" }] },
  { label: "Admin", items: [{ href: "/admin", label: "Dashboard" }, { href: "/admin/users", label: "Users" }] },
];

describe("currentHref", () => {
  it("picks the longest href that is the path or a parent of it", () => {
    expect(currentHref(sections, "/mentors")).toBe("/mentors");
    expect(currentHref(sections, "/mentor/payouts")).toBe("/mentor");
    expect(currentHref(sections, "/admin/users/42")).toBe("/admin/users");
    expect(currentHref(sections, "/admin")).toBe("/admin");
  });

  it("does not treat a shared prefix as a parent, and finds nothing for other pages", () => {
    expect(currentHref([{ items: [{ href: "/mentor", label: "Mentor workspace" }] }], "/mentors")).toBeUndefined();
    expect(currentHref(sections, "/settings")).toBeUndefined();
  });
});

describe("SideNav", () => {
  it("renders the sections as links and marks the current one", () => {
    render(<SideNav label="Main" sections={sections} currentPath="/admin" />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Mentors", "/mentors"],
      ["Mentor workspace", "/mentor"],
      ["Dashboard", "/admin"],
      ["Users", "/admin/users"],
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent)).toEqual([
      "Dashboard",
    ]);
    // The section name labels its list; the unnamed first section has no label.
    expect(screen.getByRole("list", { name: "Admin" })).toBeTruthy();
    expect(screen.getAllByRole("list")[0].getAttribute("aria-labelledby")).toBeNull();
  });

  it("marks nothing on a page outside the navigation", () => {
    render(<SideNav label="Main" sections={sections} currentPath="/settings" />);

    expect(document.querySelector("[aria-current]")).toBeNull();
  });
});

describe("AppShell", () => {
  it("renders the header, the navigation and the page in order", () => {
    render(
      <AppShell header={<header>bar</header>} nav={<nav aria-label="Main">nav</nav>}>
        <main>page</main>
      </AppShell>,
    );

    const [header, nav, main] = [screen.getByRole("banner"), screen.getByRole("navigation"), screen.getByRole("main")];
    expect(header.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
