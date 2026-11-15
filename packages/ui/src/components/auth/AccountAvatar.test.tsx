import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountAvatar } from "./AccountAvatar";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AccountAvatar", () => {
  it("renders the decorative avatar image", () => {
    const { container } = render(<AccountAvatar src="https://avatars.example/ola" />);

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://avatars.example/ola");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("removes an image that fails to load instead of showing a broken-image icon", () => {
    const { container } = render(<AccountAvatar src="http://localhost:3999/avatars/mock-mentee.svg" />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
  });

  it("removes an image that already failed before mount (no onError after hydration)", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);

    const { container } = render(<AccountAvatar src="http://localhost:3999/avatars/gone.svg" />);

    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps an image that finished loading before mount, and tries again for a new URL after a failure", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(40);

    const { container, rerender } = render(<AccountAvatar src="https://avatars.example/a" />);
    expect(container.querySelector("img")).not.toBeNull();

    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();

    rerender(<AccountAvatar src="https://avatars.example/b" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://avatars.example/b");
  });
});
