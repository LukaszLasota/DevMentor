import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Field } from "./Field";

describe("Field", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field label="Price for 50 minutes" hint="In PLN, for example 120" error="Enter a price in PLN, for example 120" required>
        {(control) => <Input {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText(/Price for 50 minutes/);
    expect(input).toHaveProperty("required", true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "In PLN, for example 120",
      "Enter a price in PLN, for example 120",
    ]);
    expect(screen.getByText("(required)")).toBeTruthy();
  });

  it("leaves aria attributes off when there is no hint or error, and marks optional fields", () => {
    render(
      <Field label="Public work link" optional>
        {(control) => <Input {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText(/Public work link/);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByText("(optional)")).toBeTruthy();
  });

  it("puts an inline control before its label and keeps the hint and error below", () => {
    const { container } = render(
      <Field label="TypeScript" hint="Shown on your page" error="Pick at least one tag" inline>
        {(control) => <Checkbox {...control} />}
      </Field>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "TypeScript" });
    expect(checkbox.getAttribute("aria-describedby")!.split(" ")).toHaveLength(2);
    const row = container.querySelector("[data-slot=field] > div")!;
    expect(row.firstElementChild).toBe(checkbox);
  });

  it("renders a plain label without a marker", () => {
    render(<Field label="Display name">{(control) => <Input {...control} />}</Field>);
    expect(screen.getByLabelText("Display name")).toBeTruthy();
  });
});
