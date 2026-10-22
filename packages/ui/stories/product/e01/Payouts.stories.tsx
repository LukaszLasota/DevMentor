import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PayoutStatusPanel } from "../../../src";

const meta = {
  title: "Product/E01 Mentor onboarding/Payout status (1.1)",
  component: PayoutStatusPanel,
  args: { state: { kind: "none" }, onStart: fn(), onRefresh: fn() },
} satisfies Meta<typeof PayoutStatusPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotSetUp: Story = {};
export const ActionRequired: Story = {
  args: { state: { kind: "action_required", guidance: ["Add your date of birth.", "Add the bank account for payouts."] } },
};
export const PendingVerification: Story = { args: { state: { kind: "pending_verification" } } };
export const Enabled: Story = { args: { state: { kind: "enabled" } } };
export const Restricted: Story = { args: { state: { kind: "restricted", guidance: ["Confirm your identity document."] } } };
export const Failed: Story = { args: { state: { kind: "failed" } } };
