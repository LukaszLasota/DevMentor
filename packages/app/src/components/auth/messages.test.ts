import { describe, expect, it } from "vitest";
import { failureMessage, MAIL_FAILED, tooManyAttempts, withMessage } from "./messages";

describe("auth form messages", () => {
  it.each([
    [undefined, "Too many attempts. Try again later."],
    [0, "Too many attempts. Try again in 1 minute."],
    [60, "Too many attempts. Try again in 1 minute."],
    [61, "Too many attempts. Try again in 2 minutes."],
    [900, "Too many attempts. Try again in 15 minutes."],
  ])("words a 429 retry after %s s", (seconds, text) => {
    expect(tooManyAttempts(seconds)).toBe(text);
  });

  it("maps 429 and 503, keeps other messages", () => {
    expect(failureMessage({ code: "TOO_MANY_REQUESTS", message: "x", retryAfterSeconds: 120 }, MAIL_FAILED)).toBe(
      "Too many attempts. Try again in 2 minutes.",
    );
    expect(failureMessage({ code: "SERVICE_UNAVAILABLE", message: "Mail is down." }, MAIL_FAILED)).toBe(MAIL_FAILED);
    expect(failureMessage({ code: "UNAUTHORIZED", message: "Invalid email or password." }, MAIL_FAILED)).toBe(
      "Invalid email or password.",
    );
  });

  it("keeps the code and field errors of a failure", () => {
    expect(
      withMessage({ ok: false, error: { code: "VALIDATION_ERROR", message: "Check the fields.", fieldErrors: { email: ["Bad"] } } }, MAIL_FAILED),
    ).toEqual({ ok: false, error: { code: "VALIDATION_ERROR", message: "Check the fields.", fieldErrors: { email: ["Bad"] } } });
  });
});
