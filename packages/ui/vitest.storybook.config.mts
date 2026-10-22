import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Stories as tests (a11y violations fail). Separate from the root unit-test config so the
// 100% coverage gate is untouched. Theme comes from STORYBOOK_THEME (light | dark).
const theme = process.env.STORYBOOK_THEME === "dark" ? "dark" : "light";

export default defineConfig({
  plugins: [
    storybookTest({
      configDir: fileURLToPath(new URL("./.storybook", import.meta.url)),
      initialGlobals: { theme },
    }),
  ],
  // Pre-bundle story dependencies: otherwise the first run after a new import re-optimises
  // them mid-run and the story files fail to load.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "class-variance-authority",
      "cn",
      "lucide-react",
      "radix-ui",
      "storybook/test",
      "storybook/preview-api",
      "storybook/internal/core-events",
      "storybook/theming",
      "@storybook/addon-docs/blocks",
    ],
  },
  test: {
    name: `storybook-${theme}`,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
