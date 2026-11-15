import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PasswordField, type PasswordFieldProps } from "./PasswordField";

function Controlled(props: Partial<PasswordFieldProps>) {
  const [value, setValue] = useState("");
  return <PasswordField label="New password" value={value} onChange={setValue} {...props} />;
}

describe("PasswordField", () => {
  it("hides the password until Show password is checked, keeping the value (L05)", async () => {
    const user = userEvent.setup();
    render(<Controlled hint="12 to 128 characters." required />);
    const input = screen.getByLabelText(/New password/) as HTMLInputElement;

    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("new-password");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-describedby")).toBeTruthy();

    await user.type(input, "correct horse");
    await user.click(screen.getByRole("checkbox", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("correct horse");

    await user.click(screen.getByLabelText("Show password"));
    expect(input.type).toBe("password");
  });

  it("shows an error, passes name and autoComplete, and reports blur", async () => {
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(<Controlled error="Password must be at least 12 characters." name="password" autoComplete="current-password" onBlur={onBlur} />);
    const input = screen.getByLabelText("New password") as HTMLInputElement;

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.name).toBe("password");
    expect(input.autocomplete).toBe("current-password");
    expect(screen.getByText("Password must be at least 12 characters.")).toBeTruthy();

    await user.click(input);
    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
