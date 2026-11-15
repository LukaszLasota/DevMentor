import { describe, expect, it } from "vitest";
import { accountNavSections } from "./accountNav";

const links = (roles: Parameters<typeof accountNavSections>[0]) =>
  accountNavSections(roles).map((section) => [section.label ?? null, section.items.map((item) => `${item.label} ${item.href}`)]);

describe("accountNavSections", () => {
  it("gives a mentee the mentor list only (L04)", () => {
    expect(links(["mentee"])).toEqual([[null, ["Mentors /mentors"]]]);
  });

  it("adds the mentor workspace and the admin dashboard for those roles (L09)", () => {
    expect(links(["mentee", "mentor", "operator"])).toEqual([
      [null, ["Mentors /mentors", "Mentor workspace /mentor"]],
      ["Admin", ["Dashboard /admin"]],
    ]);
  });

  it("gives an operator without the mentor role the admin section but no mentor workspace", () => {
    expect(links(["mentee", "operator"])).toEqual([
      [null, ["Mentors /mentors"]],
      ["Admin", ["Dashboard /admin"]],
    ]);
  });
});
