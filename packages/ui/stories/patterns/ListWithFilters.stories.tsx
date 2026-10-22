import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { longTexts, marta, tomasz } from "../product/fixtures";
import { MentorListPattern } from "./MentorListPattern";

const meta = {
  title: "Patterns/List with filters",
  component: MentorListPattern,
  args: { state: { kind: "results", tag: null, items: [marta, tomasz, longTexts] } },
} satisfies Meta<typeof MentorListPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("article")).toHaveLength(3);
    await expect(canvas.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  },
};
export const FilteredByTag: Story = { args: { state: { kind: "results", tag: "react", items: [tomasz] } } };
export const Loading: Story = { args: { state: { kind: "loading" } } };
export const NothingYet: Story = { args: { state: { kind: "results", tag: null, items: [] } } };
export const NoResultsForFilter: Story = {
  args: { state: { kind: "results", tag: "python", items: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/No Python mentors have open times right now./)).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Show all mentors" })).toHaveAttribute("href", "/mentors");
  },
};
export const UnknownTag: Story = { args: { state: { kind: "unknown-tag" } } };
export const LoadError: Story = { args: { state: { kind: "error" } } };
export const ManyResults: Story = {
  args: {
    state: {
      kind: "results",
      tag: null,
      items: Array.from({ length: 12 }, (_, i) => ({ ...(i % 2 ? marta : tomasz), slug: `m${i}` })),
    },
  },
};
export const NarrowScreen: Story = { decorators: [(Story) => <div className="w-72">{Story()}</div>] };
