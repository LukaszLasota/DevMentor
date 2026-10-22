import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { MentorTagFilter } from "../../../src/mentors";

const meta = {
  title: "Product/E02 Finding a mentor/Tag filter",
  component: MentorTagFilter,
  args: { active: null },
} satisfies Meta<typeof MentorTagFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  },
};

export const OneTagActive: Story = { args: { active: "ai-agents" } };

export const StateMatrix: Story = {
  render: () => (
    <nav aria-label="Preview states">
      <ul className="flex gap-related">
        {(["hover", "focus"] as const).map((state) => (
          <li key={state}>
            <a
              href="/mentors?tag=react"
              data-preview-state={state}
              tabIndex={-1}
              className="inline-flex min-h-button-sm items-center rounded-control px-related text-label text-muted-foreground outline-none transition-colors duration-control hover:bg-muted hover:text-foreground focus-visible:focus-ring"
            >
              React ({state})
            </a>
          </li>
        ))}
      </ul>
    </nav>
  ),
};

export const NarrowScreen: Story = {
  args: { active: "python" },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
};
