import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/account/AccountHeader", () => ({
  AccountHeader: ({ area }: { area?: string }) => <header>account bar {area ?? "no area"}</header>,
}));
vi.mock("@/components/account/AccountNav", () => ({
  AccountNav: () => <nav aria-label="Main">sidebar</nav>,
}));

const { default: MenteeRootLayout, metadata } = await import("./layout");

describe("mentee root layout", () => {
  it("renders the app shell (account bar, sidebar) around its children", () => {
    // The layout renders <html>/<body>; render its body content only.
    const tree = MenteeRootLayout({ children: <p>child</p> });
    const body = (tree.props as { children: React.ReactElement<{ children: React.ReactNode }> }).children;

    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("en");
    render(<>{body.props.children}</>);

    expect(screen.getByRole("banner").textContent).toBe("account bar no area");
    expect(screen.getByRole("navigation", { name: "Main" }).textContent).toBe("sidebar");
    expect(screen.getByText("child")).toBeTruthy();
    expect(metadata.title).toBe("DevMentor");
  });
});
