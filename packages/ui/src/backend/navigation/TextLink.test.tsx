import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextLink } from "./TextLink";

describe("TextLink", () => {
  it("renders an underlined internal link", () => {
    render(<TextLink href="/mentors">Find a mentor</TextLink>);

    const link = screen.getByRole("link", { name: "Find a mentor" });
    expect(link.getAttribute("data-slot")).toBe("text-link");
    expect(link.className).toContain("underline");
    expect(link.hasAttribute("target")).toBe(false);
  });

  it("opens external links in a new tab and says so", () => {
    render(
      <TextLink href="https://github.com/example" external>
        Public work
      </TextLink>,
    );

    const link = screen.getByRole("link", { name: "Public work(opens in a new tab)" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("styles a router link passed as child", () => {
    render(
      <TextLink asChild>
        <a href="/m/marta">Marta</a>
      </TextLink>,
    );

    expect(screen.getByRole("link", { name: "Marta" }).getAttribute("data-slot")).toBe("text-link");
  });
});
