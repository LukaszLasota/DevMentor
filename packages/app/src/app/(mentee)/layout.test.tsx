import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/account/AccountHeader", () => ({
  AccountHeader: ({ area }: { area?: string }) => <header>account bar {area ?? "no area"}</header>,
}));

const { default: MenteeRootLayout, metadata } = await import("./layout");

describe("mentee root layout", () => {
  it("renders the account bar above its children", () => {
    // The layout renders <html>/<body>; render its body content only.
    const tree = MenteeRootLayout({ children: <p>child</p> });
    const body = (tree.props as { children: React.ReactElement<{ children: React.ReactNode }> }).children;

    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("en");
    render(<>{body.props.children}</>);

    expect(screen.getByRole("banner").textContent).toBe("account bar no area");
    expect(screen.getByText("child")).toBeTruthy();
    expect(metadata.title).toBe("DevMentor");
  });
});
