import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { MentorCard } from "../../../src/mentors";
import { longTexts, marta, tomasz } from "../fixtures";

const meta = {
  title: "Product/E02 Finding a mentor/Mentor card",
  component: MentorCard,
  args: marta,
  decorators: [(Story) => <div className="max-w-measure">{Story()}</div>],
} satisfies Meta<typeof MentorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Marta Kowal" })).toHaveAttribute("href", "/m/marta-kowal");
    await expect(canvas.queryByText(/rating|stars|popular/i)).toBeNull();
  },
};

export const WithPhoto: Story = {
  args: { avatarUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1' fill='gray'/></svg>" },
};

export const LongTexts: Story = { args: longTexts };

export const NarrowScreen: Story = {
  args: longTexts,
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};

export const ManyInAList: Story = {
  render: () => (
    <ul className="max-w-measure">
      {[marta, tomasz, longTexts, { ...tomasz, slug: "t2", displayName: "Ola Nowak" }].map((m) => (
        <li key={m.slug}>
          <MentorCard {...m} />
        </li>
      ))}
    </ul>
  ),
};
