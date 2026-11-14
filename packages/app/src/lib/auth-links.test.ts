import { describe, expect, it } from "vitest";
import { single, withReturnTo } from "./auth-links";

describe("auth links", () => {
  it("adds returnTo only when there is one", () => {
    expect(withReturnTo("/register", "/mentors?tag=go")).toBe("/register?returnTo=%2Fmentors%3Ftag%3Dgo");
    expect(withReturnTo("/register", "")).toBe("/register");
  });

  it("reads a single query value", () => {
    expect(single("a")).toBe("a");
    expect(single(["a", "b"])).toBeUndefined();
    expect(single(undefined)).toBeUndefined();
  });
});
