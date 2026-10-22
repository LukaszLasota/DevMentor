import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("marketing root layout", () => {
  it("renders the html shell", async () => {
    const { default: SiteRootLayout, metadata } = await import("./layout");

    const html = renderToStaticMarkup(
      <SiteRootLayout>
        <p>child</p>
      </SiteRootLayout>,
    );

    expect(html).toContain('<html lang="en" class="h-full antialiased">');
    expect(html).toContain("<p>child</p>");
    expect(metadata).toEqual({ title: "DevMentor", description: "DevMentor" });
  });
});
