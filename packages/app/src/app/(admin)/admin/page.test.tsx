import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./HealthPanel", () => ({ HealthPanel: () => <div>health panel</div> }));

describe("AdminPage", () => {
  it("renders the heading and the health panel", async () => {
    const { default: AdminPage } = await import("./page");

    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("health panel")).toBeTruthy();
  });
});
