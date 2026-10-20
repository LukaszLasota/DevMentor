import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminRootLayout, { metadata } from "./layout";

describe("admin root layout", () => {
  it("renders the html shell around its children", () => {
    const html = renderToStaticMarkup(
      <AdminRootLayout>
        <p>child</p>
      </AdminRootLayout>,
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain("<p>child</p>");
    expect(metadata.title).toBe("DevMentor Admin");
  });
});
