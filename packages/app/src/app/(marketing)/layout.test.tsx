import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

describe("marketing root layout", () => {
  it("renders the html shell with the font variables", async () => {
    const { default: SiteRootLayout, metadata } = await import("./layout");

    const html = renderToStaticMarkup(
      <SiteRootLayout>
        <p>child</p>
      </SiteRootLayout>,
    );

    expect(html).toContain("font-geist-sans font-geist-mono");
    expect(html).toContain("<p>child</p>");
    expect(metadata).toEqual({ title: "DevMentor", description: "DevMentor" });
  });
});
