import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the starter content", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("To get started, edit the");
    expect(screen.getByRole("link", { name: /Deploy Now/ })).toBeTruthy();
  });
});
