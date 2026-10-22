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
