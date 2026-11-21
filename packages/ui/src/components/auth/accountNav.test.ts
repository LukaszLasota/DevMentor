import { describe, expect, it } from "vitest";
import { accountNavSections } from "./accountNav";

const links = (roles: Parameters<typeof accountNavSections>[0]) =>
  accountNavSections(roles).map((section) => [section.label ?? null, section.items.map((item) => `${item.label} ${item.href}`)]);

describe("accountNavSections", () => {
  it("gives a mentee the mentor list and their sessions (L04)", () => {
    expect(links(["mentee"])).toEqual([[null, ["Mentors /mentors", "My sessions /sessions"]]]);
  });

  it("adds the mentor workspace, the mentor page and the admin dashboard for those roles (L09, #23)", () => {
    expect(links(["mentee", "mentor", "operator"])).toEqual([
      [null, ["Mentors /mentors", "My sessions /sessions", "Mentor workspace /mentor", "Your page /mentor/profile", "Prices /mentor/prices", "Open times /mentor/slots", "Payouts /mentor/payouts"]],
      ["Admin", ["Dashboard /admin"]],
    ]);
  });

  it("gives an operator without the mentor role the admin section but no mentor workspace", () => {
    expect(links(["mentee", "operator"])).toEqual([
      [null, ["Mentors /mentors", "My sessions /sessions"]],
      ["Admin", ["Dashboard /admin"]],
    ]);
  });
});
