import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import { ContrastTable } from "../../.storybook/blocks/FoundationBlocks";

// Guard: fails the story test run when any token pair drops below the WCAG threshold.
const meta: Meta<typeof ContrastTable> = {
  title: "Foundations/Color/Contrast check",
  component: ContrastTable,
  tags: ["!autodocs"],
};

export default meta;

export const AllPairsPass: StoryObj<typeof ContrastTable> = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.textContent).not.toContain("…"));
    expect(canvasElement.textContent).not.toContain("FAIL");
    expect(canvasElement.textContent).not.toContain("not measured");
  },
};
