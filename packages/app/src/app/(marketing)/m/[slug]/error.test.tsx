import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MentorPageError from "./error";

describe("/m/[slug] error state", () => {
  it("says the page cannot be shown, with no detail, and retries", async () => {
    const reset = vi.fn();
    render(<MentorPageError error={Object.assign(new Error("connection refused"), { digest: "x" })} reset={reset} />);

    expect(screen.getByText("This mentor page cannot be shown right now. Try again in a minute.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("connection refused");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
