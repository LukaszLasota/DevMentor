import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingPending, PENDING_MAX_POLLS, PENDING_POLL_MS } from "./BookingPending";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BookingPending", () => {
  it("re-reads the page every few seconds, then stops and asks for a manual refresh", () => {
    render(<BookingPending />);

    expect(screen.getByRole("status").textContent).toBe("Waiting for payment confirmation…This page updates by itself.");

    for (let poll = 0; poll < PENDING_MAX_POLLS; poll += 1) {
      act(() => {
        vi.advanceTimersByTime(PENDING_POLL_MS);
      });
    }

    expect(router.refresh).toHaveBeenCalledTimes(PENDING_MAX_POLLS);
    expect(screen.getByRole("status").textContent).toContain("This is taking longer than usual — refresh this page in a minute.");

    act(() => {
      vi.advanceTimersByTime(PENDING_POLL_MS * 5);
    });
    expect(router.refresh).toHaveBeenCalledTimes(PENDING_MAX_POLLS);
  });

  it("stops polling when it leaves the page", () => {
    const { unmount } = render(<BookingPending />);
    unmount();

    act(() => {
      vi.advanceTimersByTime(PENDING_POLL_MS * 2);
    });
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
