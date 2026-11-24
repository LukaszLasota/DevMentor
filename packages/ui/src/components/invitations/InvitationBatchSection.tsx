"use client";

import { DataTable, type DataTableColumn } from "../../backend/tables/DataTable";
import { LocalTime } from "../../time/LocalTime";
import { stackTagLabel, type StackTagKey } from "../mentors/vocabulary";
import { Badge } from "../ui/badge";

// Mirrors of the API shapes of `GET /api/admin/invitation-batches` (`InvitationRowView`, `BatchView` in
// @devmentor/core); ui never imports core, so keep both in sync.

/** Rule-3 status codes (spec 2026-11-24-invitation-batches). */
export type InvitationBatchStatus = "revoked" | "waiting" | "expired" | "published" | "accepted_no_slot" | "no_slot_in_window";

export type InvitationBatchState = "open" | "full" | "stopped";

export interface InvitationBatchRow {
  id: string;
  email: string;
  /** Null before acceptance; the accepting user's email when the display name is blank. */
  mentorName: string | null;
  stackTags: StackTagKey[];
  status: InvitationBatchStatus;
  /** ISO instant, accepted invitations only. */
  publishDueAt: string | null;
}

export interface InvitationBatchCounts {
  sent: number;
  accepted: number;
  published: number;
}

const STATUS_LABELS: Record<InvitationBatchStatus, string> = {
  revoked: "Revoked",
  waiting: "Waiting for acceptance",
  expired: "Expired, not accepted",
  published: "Published a slot",
  accepted_no_slot: "Accepted, no slot yet",
  no_slot_in_window: "No slot within two weeks",
};

/** The rule-3 words for a status code: what operators read, never the code. */
export function invitationStatusLabel(status: InvitationBatchStatus): string {
  return STATUS_LABELS[status];
}

const ACCEPTED: readonly InvitationBatchStatus[] = ["published", "accepted_no_slot", "no_slot_in_window"];

const STATE_BADGES: Record<InvitationBatchState, { label: string; tone: "neutral" | "danger" }> = {
  open: { label: "Open", tone: "neutral" },
  full: { label: "Full", tone: "neutral" },
  stopped: { label: "Stopped", tone: "danger" },
};

/** A batch holds at most this many invitations (R13; `INVITATION_BATCH_SIZE` in core). */
const BATCH_SIZE = 20;

function publishBy(row: InvitationBatchRow) {
  if (!ACCEPTED.includes(row.status)) {
    return "Not accepted";
  }

  return row.publishDueAt === null ? "No deadline recorded" : <LocalTime iso={row.publishDueAt} format="long-date" />;
}

const columns: DataTableColumn<InvitationBatchRow>[] = [
  {
    id: "mentor",
    header: "Mentor",
    cell: (row) =>
      row.mentorName === null || row.mentorName === row.email ? (
        row.email
      ) : (
        <div className="flex flex-col">
          <span>{row.mentorName}</span>
          <span className="text-body-small text-muted-foreground">{row.email}</span>
        </div>
      ),
  },
  { id: "tags", header: "Stack tags", cell: (row) => row.stackTags.map(stackTagLabel).join(", ") },
  { id: "status", header: "Status", cell: (row) => invitationStatusLabel(row.status) },
  { id: "publishBy", header: "Publish by", cell: publishBy },
];

export interface InvitationBatchSectionProps {
  /** "Batch 3" or "Created before batches". */
  heading: string;
  /** Batch state label; omitted for invitations created before batches. */
  state?: InvitationBatchState;
  /** Batch counts (rule 4); omitted for invitations created before batches. */
  counts?: InvitationBatchCounts;
  /** Oldest first. */
  rows: InvitationBatchRow[];
}

/**
 * One invitation batch on /admin/invitations (spec 2026-11-24-invitation-batches): heading, state,
 * counts and every invitation with its status in words. The table scrolls in its own container.
 */
export function InvitationBatchSection({ heading, state, counts, rows }: InvitationBatchSectionProps) {
  const id = `batch-${heading.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-related">
      <div className="flex flex-wrap items-center gap-related">
        <h2 id={id} className="text-heading-2 font-semibold">
          {heading}
        </h2>
        {state === undefined ? null : <Badge tone={STATE_BADGES[state].tone}>{STATE_BADGES[state].label}</Badge>}
      </div>
      {counts === undefined ? null : (
        <p className="text-body-small text-muted-foreground">
          {counts.sent} of {BATCH_SIZE} sent, {counts.accepted} accepted, {counts.published} published within two weeks
        </p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        pageSize={BATCH_SIZE}
        emptyTitle="No invitations in this batch yet."
      />
    </section>
  );
}
