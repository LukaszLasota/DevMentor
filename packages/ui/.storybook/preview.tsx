import { DocsContainer, type DocsContainerProps } from "@storybook/addon-docs/blocks";
import type { Decorator, Preview } from "@storybook/react-vite";
import { mswLoader } from "msw-storybook-addon/csf3";
import { useEffect, useState, type PropsWithChildren } from "react";
import { GLOBALS_UPDATED, SET_GLOBALS } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";
import { themes } from "storybook/theming";
import "./storybook.css";
import "./docs.css";

type Theme = "light" | "dark";
type GlobalsEvent = { globals: Record<string, unknown> };

const toTheme = (value: unknown): Theme => (value === "dark" ? "dark" : "light");

// Prompt rule 9: the theme class goes on <html>, so overlays rendered outside the story get it too.
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

// Docs pages render no story decorators, so they follow the toolbar through the channel.
if (addons.hasChannel()) {
  const onGlobals = ({ globals }: GlobalsEvent) => applyTheme(toTheme(globals.theme));
  addons.getChannel().on(SET_GLOBALS, onGlobals);
  addons.getChannel().on(GLOBALS_UPDATED, onGlobals);
}

const withTheme: Decorator = (Story, context) => {
  applyTheme(toTheme(context.globals.theme));
  return <Story />;
};

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Docs chrome follows the class on <html>. */
function ThemedDocsContainer({ children, context }: PropsWithChildren<DocsContainerProps>) {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return (
    <DocsContainer context={context} theme={theme === "dark" ? themes.dark : themes.light}>
      {children}
    </DocsContainer>
  );
}

const preview: Preview = {
  decorators: [withTheme],
  // Simulated API answers per story: beforeEach({ msw }) => msw.use(http.post(...)) (msw-storybook-addon).
  loaders: [mswLoader()],
  globalTypes: {
    theme: {
      description: "Colour theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  parameters: {
    // Accessibility violations fail the story tests (lesson 06, stage 1).
    a11y: { test: "error" },
    docs: { container: ThemedDocsContainer },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: {
      storySort: {
        order: [
          "Design system",
          "Foundations",
          ["Color", "Typography", "Spacing and layout", "Shape and depth", "Motion", "Icons", "Themes"],
          "Primitives",
          "Product",
          "Patterns",
        ],
      },
    },
  },
};

export default preview;
