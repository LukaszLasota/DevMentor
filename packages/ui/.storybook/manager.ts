import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

// Prompt rule 10: only the product name is visible in the Storybook UI.
addons.setConfig({
  theme: create({ base: "light", brandTitle: "DevMentor", brandUrl: "/" }),
});
