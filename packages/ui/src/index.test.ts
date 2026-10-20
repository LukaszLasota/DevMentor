import { describe, expect, it } from "vitest";

describe("@devmentor/ui public entry", () => {
  it("exports the primitives and the panel layer", async () => {
    const ui = await import("./index");

    expect(Object.keys(ui).sort()).toEqual(
      [
        "ApiError",
        "Button",
        "Checkbox",
        "CrudForm",
        "DataTable",
        "EmptyState",
        "ErrorMessage",
        "Input",
        "Label",
        "LoadingMessage",
        "Table",
        "TableBody",
        "TableCaption",
        "TableCell",
        "TableFooter",
        "TableHead",
        "TableHeader",
        "TableRow",
        "Textarea",
        "apiCall",
        "apiCallOrThrow",
        "buttonVariants",
        "cn",
        "readJsonSafe",
      ].sort(),
    );
    expect(ui.cn("a", false, "b")).toBe("a b");
  });
});
