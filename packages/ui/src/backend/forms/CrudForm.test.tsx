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

    const button = screen.getByRole("button", { name: /Saving…/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    resolve({ ok: true, data: null });
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("supports textarea, descriptions, default values and form-level schema errors", async () => {
    const bioSchema = z
      .object({ bio: z.string(), minutes: z.number().optional(), isPublic: z.boolean() })
      .refine((value) => value.bio.length > 3 || value.isPublic, "Write a longer bio or make it public");
    const onSubmit = vi.fn(async (): Promise<ApiResult<unknown>> => ({ ok: true, data: null }));
    const user = userEvent.setup();

    render(
      <CrudForm
        schema={bioSchema}
        fields={[
          { name: "bio", label: "Bio", type: "textarea", description: "Shown on your profile" },
          { name: "minutes", label: "Minutes", type: "number" },
          { name: "isPublic", label: "Public", type: "checkbox" },
        ]}
        defaultValues={{ bio: "Hi", minutes: 45, isPublic: false }}
        onSubmit={onSubmit}
        submitLabel="Create"
      />,
    );

    expect(screen.getByText("Shown on your profile")).toBeTruthy();
    expect((screen.getByLabelText("Minutes") as HTMLInputElement).value).toBe("45");
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert").textContent).toBe("Write a longer bio or make it public");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Bio"), " there");
    await user.clear(screen.getByLabelText("Minutes"));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith({ bio: "Hi there", minutes: undefined, isPublic: false });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts checked when the default is true and ignores Escape without onCancel", async () => {
    const user = userEvent.setup();
    render(
      <CrudForm
        schema={z.object({ isPublic: z.boolean() })}
        fields={[{ name: "isPublic", label: "Public", type: "checkbox" }]}
        defaultValues={{ isPublic: true }}
        onSubmit={async () => ({ ok: true, data: null })}
      />,
    );

    expect(screen.getByLabelText("Public").getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByLabelText("Public"));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Public").getAttribute("aria-checked")).toBe("false");
  });

  it("shows a server error without field errors and ignores a second submit while saving", async () => {
    let resolve: (value: ApiResult<unknown>) => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<ApiResult<unknown>>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(
      <CrudForm
        schema={z.object({ title: z.string() })}
        fields={[{ name: "title", label: "Title" }]}
        onSubmit={onSubmit}
      />,
    );

    const form = screen.getByLabelText("Title").closest("form")!;
    await user.click(screen.getByRole("button", { name: "Save" }));
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolve({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error." } });

    expect((await screen.findByRole("alert")).textContent).toBe("Internal server error.");
  });

  it("works without onSuccess", async () => {
    const onSubmit = vi.fn(async (): Promise<ApiResult<unknown>> => ({ ok: true, data: 1 }));
    const user = userEvent.setup();
    render(
      <CrudForm schema={z.object({ title: z.string() })} fields={[{ name: "title", label: "Title" }]} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({ title: "" });
  });

  it("validates a field when the user leaves it and focuses the first error on submit", async () => {
    const { user } = setup();

    await user.click(screen.getByLabelText("Title"));
    await user.tab();
    expect(screen.getByText("Title is required")).toBeTruthy();

    await user.type(screen.getByLabelText("Title"), "Helm upgrade");
    await user.tab();
    expect(screen.queryByText("Title is required")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Minutes"));
  });

  it("puts Cancel before the primary action", () => {
    setup();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel", "Save"]);
  });

  it("supports a multiselect group, a suffix, a decimal keyboard and required fields", async () => {
    const priceSchema = z.object({
      price25: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, "Enter a price like 40 or 40.50"),
      tags: z.array(z.string()).min(1, "Pick at least one stack tag").max(4),
    });
    const onSubmit = vi.fn(async (): Promise<ApiResult<unknown>> => ({ ok: true, data: null }));
    render(
      <CrudForm
        schema={priceSchema}
        fields={[
          { name: "price25", label: "25 minutes", inputMode: "decimal", suffix: "USD", required: true },
          {
            name: "tags",
            label: "Stack tags",
            type: "multiselect",
            description: "Up to four",
            options: [
              { value: "typescript", label: "TypeScript" },
              { value: "react", label: "React" },
            ],
          },
        ]}
        defaultValues={{ tags: ["react"] }}
        onSubmit={onSubmit}
      />,
    );
    const user = userEvent.setup();

    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByLabelText(/25 minutes/).getAttribute("inputmode")).toBe("decimal");
    expect(screen.getByRole("group", { name: "Stack tags" })).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "React" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Pick at least one stack tag")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Stack tags" }).getAttribute("aria-describedby")).toBe("tags-group-error");
    expect(document.activeElement).toBe(screen.getByLabelText(/25 minutes/));

    await user.type(screen.getByLabelText(/25 minutes/), "40");
    await user.click(screen.getByRole("checkbox", { name: "TypeScript" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith({ price25: "40", tags: ["typescript"] });
  });

  it("starts a multiselect empty without a default and validates textarea on blur", async () => {
    const bioSchema = z.object({ bio: z.string().min(1, "Write what you have done"), tags: z.array(z.string()) });
    render(
      <CrudForm
        schema={bioSchema}
        fields={[
          { name: "bio", label: "What you have done", type: "textarea" },
          { name: "tags", label: "Stack tags", type: "multiselect" },
        ]}
        onSubmit={vi.fn(async (): Promise<ApiResult<unknown>> => ({ ok: true, data: null }))}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("What you have done"));
    await user.tab();
    expect(screen.getByText("Write what you have done")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
