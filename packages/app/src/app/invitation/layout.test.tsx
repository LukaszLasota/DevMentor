import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InvitationRootLayout, { metadata } from "./layout";

describe("invitation root layout", () => {
  it("renders the html shell with the wordmark around its children, without a referrer", () => {
    const html = renderToStaticMarkup(
      <InvitationRootLayout>
        <p>child</p>
      </InvitationRootLayout>,
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain("DevMentor</span>");
    expect(html).toContain("<main");
    expect(html).toContain("<p>child</p>");
    expect(metadata).toEqual({ title: "DevMentor", referrer: "no-referrer" });
  });
});
