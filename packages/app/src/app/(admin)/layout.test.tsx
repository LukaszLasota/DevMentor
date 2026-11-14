import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./OperatorGuard", () => ({
  OperatorGuard: ({ children }: { children: React.ReactNode }) => <div data-testid="guard">{children}</div>,
}));

vi.mock("@/components/account/AccountHeader", () => ({
  AccountHeader: ({ area }: { area: string }) => <header>account bar {area}</header>,
}));

vi.mock("@/components/account/AccountNav", () => ({
  AccountNav: () => <nav aria-label="Main">sidebar</nav>,
}));

const { default: AdminRootLayout, metadata } = await import("./layout");

describe("admin root layout", () => {
  it("renders the app shell (account bar, sidebar) and its children behind the operator guard", () => {
    // The layout renders <html>/<body>; render its body content only.
    const tree = AdminRootLayout({ children: <p>child</p> });
    const body = (tree.props as { children: React.ReactElement<{ children: React.ReactNode }> }).children;

    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("en");
    render(<>{body.props.children}</>);

    expect(screen.getByTestId("guard").textContent).toBe("account bar Adminsidebarchild");
    expect(metadata.title).toBe("DevMentor Admin");
  });
});
