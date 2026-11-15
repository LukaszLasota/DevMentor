import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AuthRootLayout, { metadata } from "./layout";

describe("auth root layout", () => {
  it("renders the html shell with the wordmark around its children", () => {
    const html = renderToStaticMarkup(
      <AuthRootLayout>
        <p>child</p>
      </AuthRootLayout>,
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain("DevMentor</span>");
    expect(html).toContain("<main");
    expect(html).toContain("<p>child</p>");
    expect(metadata.title).toBe("DevMentor");
  });
});
