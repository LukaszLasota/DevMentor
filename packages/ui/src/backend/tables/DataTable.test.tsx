import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [{ id: "name", header: "Name", cell: (row) => row.name }];
const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Row ${i + 1}` }));

describe("DataTable", () => {
  it("shows the loading state", () => {
    render(<DataTable columns={columns} rows={undefined} getRowId={(r) => r.id} isLoading />);

    expect(screen.getByRole("status").textContent).toBe("Loading…");
  });

  it("shows the error state with retry", async () => {
    const onRetry = vi.fn();
    render(<DataTable columns={columns} rows={undefined} getRowId={(r) => r.id} error="Boom" onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toContain("Boom");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} rows={[]} getRowId={(r) => r.id} emptyTitle="No sessions" />);

    expect(screen.getByText("No sessions")).toBeTruthy();
  });

  it("renders rows and row actions", () => {
    render(
      <DataTable columns={columns} rows={rows(2)} getRowId={(r) => r.id} rowActions={(row) => <button>Edit {row.name}</button>} />,
    );

    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Row 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Row 2" })).toBeTruthy();
  });

  it("paginates when rows exceed the page size", async () => {
    render(<DataTable columns={columns} rows={rows(5)} getRowId={(r) => r.id} pageSize={2} />);

    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.queryByText("Row 3")).toBeNull();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(screen.getByText("Row 3")).toBeTruthy();
    expect(screen.queryByText("Row 1")).toBeNull();
  });

  it("hides pagination for a single page", () => {
    render(<DataTable columns={columns} rows={rows(2)} getRowId={(r) => r.id} pageSize={10} />);

    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});
