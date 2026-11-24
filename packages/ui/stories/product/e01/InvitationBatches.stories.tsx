import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { InvitationBatchSection, type InvitationBatchRow } from "../../../src";

// /admin/invitations sections (spec 2026-11-24-invitation-batches): one per batch, plus invitations
// created before batches. Statuses are the rule-3 words, never codes.

const rows: InvitationBatchRow[] = [
  { id: "1", email: "ada@example.com", mentorName: "Ada Lovelace", stackTags: ["typescript", "react"], status: "published", publishDueAt: "2026-12-08T14:05:00Z" },
  { id: "2", email: "grace@example.com", mentorName: "grace@example.com", stackTags: ["python"], status: "accepted_no_slot", publishDueAt: "2026-12-10T09:00:00Z" },
  { id: "3", email: "alan@example.com", mentorName: "Alan Turing", stackTags: ["ai-agents"], status: "no_slot_in_window", publishDueAt: "2026-11-20T09:00:00Z" },
  { id: "4", email: "linus@example.com", mentorName: null, stackTags: ["typescript"], status: "waiting", publishDueAt: null },
  { id: "5", email: "barbara@example.com", mentorName: null, stackTags: ["react"], status: "expired", publishDueAt: null },
  { id: "6", email: "edsger@example.com", mentorName: null, stackTags: ["python"], status: "revoked", publishDueAt: null },
];

const meta = {
  title: "Product/E01 Mentor onboarding/Invitation batches",
  component: InvitationBatchSection,
  args: { heading: "Batch 2", state: "open", counts: { sent: 6, accepted: 3, published: 1 }, rows },
} satisfies Meta<typeof InvitationBatchSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("6 of 20 sent, 3 accepted, 1 published within two weeks")).toBeVisible();
    await expect(canvas.getByText("Waiting for acceptance")).toBeVisible();
  },
};

export const Full: Story = { args: { heading: "Batch 1", state: "full", counts: { sent: 20, accepted: 9, published: 6 } } };

export const Stopped: Story = {
  args: { heading: "Batch 1", state: "stopped", counts: { sent: 20, accepted: 4, published: 4 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Stopped")).toBeVisible();
  },
};

export const CreatedBeforeBatches: Story = {
  args: { heading: "Created before batches", state: undefined, counts: undefined, rows: rows.slice(3) },
};

export const Phone: Story = {
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};
