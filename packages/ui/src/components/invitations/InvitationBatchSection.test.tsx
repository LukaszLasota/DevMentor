import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatInstant } from "../../time/LocalTime";
import { InvitationBatchSection, invitationStatusLabel, type InvitationBatchRow } from "./InvitationBatchSection";

const DUE = "2026-12-08T14:05:00.000Z";

function row(overrides: Partial<InvitationBatchRow> = {}): InvitationBatchRow {
  return {
    id: crypto.randomUUID(),
    email: "anna@example.com",
    mentorName: null,
    stackTags: ["typescript"],
    status: "waiting",
    publishDueAt: null,
    ...overrides,
  };
}

const cellsOf = (tableRow: HTMLElement) => within(tableRow).getAllByRole("cell").map((cell) => cell.textContent);

describe("invitationStatusLabel", () => {
  it("maps every status code to the rule-3 words", () => {
    expect(
      (["revoked", "waiting", "expired", "published", "accepted_no_slot", "no_slot_in_window"] as const).map(invitationStatusLabel),
    ).toEqual([
      "Revoked",
      "Waiting for acceptance",
      "Expired, not accepted",
      "Published a slot",
      "Accepted, no slot yet",
      "No slot within two weeks",
    ]);
  });
});

describe("InvitationBatchSection", () => {
  it("shows the heading, the state, the counts line and one row per invitation in words", () => {
    render(
      <InvitationBatchSection
        heading="Batch 2"
        state="open"
        counts={{ sent: 3, accepted: 2, published: 1 }}
        rows={[
          row({ email: "waiting@example.com", stackTags: ["typescript", "react"] }),
          row({ email: "ada@example.com", mentorName: "Ada Lovelace", status: "published", publishDueAt: DUE, stackTags: ["ai-agents"] }),
          row({ email: "legacy@example.com", mentorName: "legacy@example.com", status: "accepted_no_slot", publishDueAt: null }),
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "Batch 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Batch 2" })).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("3 of 20 sent, 2 accepted, 1 published within two weeks")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Mentor", "Stack tags", "Status", "Publish by"]);
    const [, first, second, third] = screen.getAllByRole("row");
    expect(cellsOf(first)).toEqual(["waiting@example.com", "TypeScript, React", "Waiting for acceptance", "Not accepted"]);
    expect(cellsOf(second)).toEqual(["Ada Lovelaceada@example.com", "AI agents", "Published a slot", formatInstant(DUE, "long-date")]);
    expect(within(second).getByText("ada@example.com").className).toContain("text-muted-foreground");
    expect(cellsOf(third)).toEqual(["legacy@example.com", "TypeScript", "Accepted, no slot yet", "No deadline recorded"]);
  });

  it("labels full and stopped batches, the stopped one as danger", () => {
    const { rerender } = render(<InvitationBatchSection heading="Batch 1" state="full" counts={{ sent: 20, accepted: 0, published: 0 }} rows={[row()]} />);
    expect(screen.getByText("Full")).toBeTruthy();

    rerender(<InvitationBatchSection heading="Batch 1" state="stopped" counts={{ sent: 20, accepted: 0, published: 0 }} rows={[row()]} />);
    expect(screen.getByText("Stopped").closest("[data-tone]")?.getAttribute("data-tone")).toBe("danger");
  });

  it("shows invitations created before batches without counts or state", () => {
    render(<InvitationBatchSection heading="Created before batches" rows={[row({ status: "expired" })]} />);

    expect(screen.getByRole("heading", { name: "Created before batches" })).toBeTruthy();
    expect(screen.queryByText(/of 20 sent/)).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
    expect(screen.getByText("Expired, not accepted")).toBeTruthy();
  });

  it("says so when a batch has no invitations yet", () => {
    render(<InvitationBatchSection heading="Batch 4" state="open" counts={{ sent: 0, accepted: 0, published: 0 }} rows={[]} />);

    expect(screen.getByText("No invitations in this batch yet.")).toBeTruthy();
  });
});
