import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";
import { LoadingMessage } from "./LoadingMessage";

describe("feedback components", () => {
  it("LoadingMessage shows a custom label", () => {
    render(<LoadingMessage label="Fetching sessions…" />);

    expect(screen.getByRole("status").textContent).toBe("Fetching sessions…");
  });

  it("ErrorMessage shows a custom title and no retry button without onRetry", () => {
    render(<ErrorMessage title="Payment failed" message="Card declined." />);

    expect(screen.getByRole("alert").textContent).toBe("Payment failedCard declined.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ErrorMessage without a title leads with the message and offers Try again", () => {
    const { container } = render(<ErrorMessage message="Database is unreachable." onRetry={() => undefined} />);

    expect(screen.getByRole("alert").textContent).toBe("Database is unreachable.Try again");
    expect(container.querySelector("p")?.className).toContain("text-destructive");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("EmptyState renders description and action only when given", () => {
    const { rerender } = render(<EmptyState title="No open times yet" />);
    expect(screen.queryByText("Be the first")).toBeNull();

    rerender(<EmptyState title="No open times yet" description="Be the first" action={<button>Write one</button>} />);

    expect(screen.getByText("Be the first")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Write one" })).toBeTruthy();
  });
});
