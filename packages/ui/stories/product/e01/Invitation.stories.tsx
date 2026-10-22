import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { InvitationPanel } from "../../../src/mentors";

const meta = {
  title: "Product/E01 Mentor onboarding/Invitation panel",
  component: InvitationPanel,
  args: {
    state: {
      kind: "signed-out",
      email: "marta@example.com",
      tags: ["typescript", "ai-agents"],
      githubHref: "#github",
      emailHref: "#email",
    },
  },
} satisfies Meta<typeof InvitationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("link").map((a) => a.textContent)).toEqual(["Sign in with GitHub", "Sign in with email"]);
  },
};

export const InvitedAccount: Story = {
  args: { state: { kind: "match", email: "marta@example.com", tags: ["typescript"], accountEmail: "marta@example.com" }, acceptAction: "#accept" },
};

export const OtherAccount: Story = {
  args: { state: { kind: "mismatch", email: "marta@example.com", accountEmail: "m.kowal@company.example", signOutHref: "#out" } },
};

export const NotValid: Story = { args: { state: { kind: "invalid" } } };

export const NarrowScreen: Story = { decorators: [(Story) => <div className="w-72">{Story()}</div>] };
