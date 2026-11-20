import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./SessionsContent", () => ({ SessionsContent: () => <p>sessions</p> }));
vi.mock("./[id]/SessionContent", () => ({ SessionContent: () => <p>session</p> }));

const { default: SessionsPage, metadata: listMeta } = await import("./page");
const { default: SessionPage, metadata: sessionMeta } = await import("./[id]/page");

describe("session pages", () => {
  it("render their content and are never indexed", () => {
    render(<SessionsPage />);
    expect(screen.getByText("sessions")).toBeTruthy();
    render(<SessionPage params={Promise.resolve({ id: "x" })} searchParams={Promise.resolve({})} />);
    expect(screen.getByText("session")).toBeTruthy();
    expect(listMeta.robots).toEqual({ index: false, follow: false });
    expect(sessionMeta.robots).toEqual({ index: false, follow: false });
  });
});
