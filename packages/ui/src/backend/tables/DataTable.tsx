"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { EmptyState } from "../feedback/EmptyState";
import { ErrorMessage } from "../feedback/ErrorMessage";
import { LoadingMessage } from "../feedback/LoadingMessage";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  isLoading?: boolean;
  /** Error message; when set, the table shows `ErrorMessage` instead of rows. */
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rows per page; pagination controls appear only when there is more than one page. */
  pageSize?: number;
  rowActions?: (row: T) => ReactNode;
}

const DEFAULT_PAGE_SIZE = 10;

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading = false,
  error = null,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  pageSize = DEFAULT_PAGE_SIZE,
  rowActions,
}: DataTableProps<T>) {
  const [requestedPage, setRequestedPage] = useState(0);

  if (isLoading) {
    return <LoadingMessage />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={onRetry} />;
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const pageCount = Math.ceil(rows.length / pageSize);
  // Clamp: the data may shrink (e.g. after a delete) while a later page is selected.
  const page = Math.min(requestedPage, pageCount - 1);
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id} className={column.className}>
                {column.header}
              </TableHead>
            ))}
            {rowActions ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <TableRow key={getRowId(row)}>
              {columns.map((column) => (
                <TableCell key={column.id} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
              {rowActions ? <TableCell className="text-right">{rowActions(row)}</TableCell> : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setRequestedPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page === pageCount - 1}
            onClick={() => setRequestedPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
