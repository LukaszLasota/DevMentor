import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApiResult } from "../api/types";
import { CrudForm } from "./CrudForm";
import { viewerTimeZone } from "./datetime";
import { DateTimeField } from "./DateTimeField";

const schema = z.object({ startsAt: z.string().regex(/Z$/, "Pick a start time on a whole minute.") });

function renderForm(timeZone: string | null = "Europe/Warsaw", defaultValue?: string, formSchema: typeof schema = schema) {
  const onSubmit = vi.fn<(values: z.output<typeof schema>) => Promise<ApiResult<unknown>>>(async () => ({ ok: true, data: null }));
  render(
    <CrudForm
      schema={formSchema}
      fields={[{ name: "startsAt", label: "Start time", type: "datetime", timeZone: timeZone ?? undefined }]}
      defaultValues={defaultValue === undefined ? {} : { startsAt: defaultValue }}
      onSubmit={onSubmit}
      submitLabel="Publish slot"
    />,
  );

  return { onSubmit, user: userEvent.setup(), input: screen.getByLabelText("Start time") as HTMLInputElement };
}

describe("CrudForm datetime field (spec #25)", () => {
  it("names the zone, echoes the resolved UTC instant and submits it", async () => {
    const { onSubmit, user, input } = renderForm();

    expect(screen.getByText("Times are in Europe/Warsaw.")).toBeTruthy();
    expect(input.type).toBe("datetime-local");
    fireEvent.change(input, { target: { value: "2026-06-22T18:00" } });
    expect(screen.getByRole("status").textContent).toBe("= 16:00 UTC, Mon 22 Jun (UTC+02:00 in Europe/Warsaw)");

    await user.click(screen.getByRole("button", { name: "Publish slot" }));

    expect(onSubmit).toHaveBeenCalledWith({ startsAt: "2026-06-22T16:00:00.000Z" });
  });

  it("echoes the earlier instant and its offset for an ambiguous fall-back time", () => {
    const { input } = renderForm();

    fireEvent.change(input, { target: { value: "2026-10-25T02:30" } });

    expect(screen.getByRole("status").textContent).toBe("= 00:30 UTC, Sun 25 Oct (UTC+02:00 in Europe/Warsaw)");
  });

  it("refuses a time skipped by the spring-forward change, on submit and on blur", async () => {
    const { onSubmit, user, input } = renderForm();
    const message = "This time does not exist in Europe/Warsaw because the clocks change. Pick another time.";

    fireEvent.change(input, { target: { value: "2027-03-28T02:30" } });
    expect(screen.getByRole("status").textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Publish slot" }));

    expect(screen.getByText(message)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "2027-03-28T03:30" } });
    fireEvent.blur(input);
    expect(screen.queryByText(message)).toBeNull();
  });

  it("refuses a skipped time even when the schema alone would accept the raw input", async () => {
    const { onSubmit, user, input } = renderForm("Europe/Warsaw", undefined, z.object({ startsAt: z.string() }));

    fireEvent.change(input, { target: { value: "2027-03-28T02:30" } });
    await user.click(screen.getByRole("button", { name: "Publish slot" }));

    expect(screen.getByText(/does not exist in Europe\/Warsaw/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("passes an empty value through so the schema names what is missing", async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole("button", { name: "Publish slot" }));

    expect(screen.getByText("Pick a start time on a whole minute.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a UTC default on the wall clock of the zone and uses the viewer's zone without one", () => {
    const { input } = renderForm("Europe/Warsaw", "2026-12-07T17:00:00.000Z");
    expect(input.value).toBe("2026-12-07T18:00");
  });

  it("falls back to the viewer's zone", () => {
    renderForm(null);

    expect(screen.getByText(`Times are in ${viewerTimeZone()}.`)).toBeTruthy();
  });

  it("names no zone in the server render (it cannot know the viewer's)", () => {
    const html = renderToString(<DateTimeField label="Start time" name="startsAt" value="2026-06-22T18:00" onChange={() => {}} />);

    expect(html).toContain("Times are in your time zone.");
    expect(html).not.toContain("UTC+");
  });
});
