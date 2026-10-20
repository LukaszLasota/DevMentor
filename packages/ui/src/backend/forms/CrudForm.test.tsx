import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApiResult } from "../api/types";
import { CrudForm, type CrudFormField } from "./CrudForm";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  minutes: z.number().int().positive("Must be positive"),
  isPublic: z.boolean(),
});

const fields: CrudFormField<keyof z.output<typeof schema>>[] = [
  { name: "title", label: "Title" },
  { name: "minutes", label: "Minutes", type: "number" },
  { name: "isPublic", label: "Public", type: "checkbox" },
];

function setup(onSubmit = vi.fn(async (): Promise<ApiResult<unknown>> => ({ ok: true, data: { id: "1" } }))) {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  render(<CrudForm schema={schema} fields={fields} onSubmit={onSubmit} onSuccess={onSuccess} onCancel={onCancel} />);

  return { onSubmit, onSuccess, onCancel, user: userEvent.setup() };
}

describe("CrudForm", () => {
  it("validates on the client with the shared schema and does not submit invalid input", async () => {
    const { onSubmit, user } = setup();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Title is required")).toBeTruthy();
    expect(screen.getByLabelText("Title").getAttribute("aria-invalid")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed values (numbers as numbers) and calls onSuccess", async () => {
    const { onSubmit, onSuccess, user } = setup();

    await user.type(screen.getByLabelText("Title"), "Intro call");
    await user.type(screen.getByLabelText("Minutes"), "30");
    await user.click(screen.getByLabelText("Public"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({ title: "Intro call", minutes: 30, isPublic: true });
    expect(onSuccess).toHaveBeenCalledWith({ id: "1" });
  });

  it("shows server field errors next to the right field", async () => {
    const { user } = setup(
      vi.fn(async (): Promise<ApiResult<unknown>> => ({
        ok: false,
        error: { code: "CONFLICT", message: "Could not save.", fieldErrors: { title: ["Title already taken"] } },
      })),
    );

    await user.type(screen.getByLabelText("Title"), "Dup");
    await user.type(screen.getByLabelText("Minutes"), "15");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toContain("Could not save.");
    const error = screen.getByText("Title already taken");
    expect(screen.getByLabelText("Title").getAttribute("aria-describedby")).toBe(error.id);
  });

  it("submits with Ctrl+Enter and cancels with Escape", async () => {
    const { onSubmit, onCancel, user } = setup();

    await user.type(screen.getByLabelText("Title"), "Quick");
    await user.type(screen.getByLabelText("Minutes"), "10");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables submit while saving", async () => {
    let resolve: (value: ApiResult<unknown>) => void = () => undefined;
    const { user } = setup(vi.fn(() => new Promise<ApiResult<unknown>>((r) => (resolve = r))));

    await user.type(screen.getByLabelText("Title"), "Slow");
    await user.type(screen.getByLabelText("Minutes"), "5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const button = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    resolve({ ok: true, data: null });
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
  });
});
