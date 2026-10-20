"use client";

import { useEffect, useState } from "react";
import { apiCall, DataTable, type ApiResult, type DataTableColumn } from "@devmentor/ui";

interface HealthStatus {
  database: "up";
}

interface HealthRow {
  id: string;
  component: string;
  status: string;
}

const columns: DataTableColumn<HealthRow>[] = [
  { id: "component", header: "Component", cell: (row) => row.component },
  { id: "status", header: "Status", cell: (row) => row.status },
];

/** Reference usage of the panel layer: apiCall → DataTable with its loading/error/empty states. */
export function HealthPanel() {
  const [rows, setRows] = useState<HealthRow[]>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    function apply(result: ApiResult<HealthStatus>) {
      setIsLoading(false);

      if (!result.ok) {
        setRows(undefined);
        setError(result.error.message);
        return;
      }

      setError(null);
      setRows([{ id: "database", component: "Database", status: result.data.database }]);
    }

    void apiCall<HealthStatus>("/api/health").then((result) => {
      // Ignore a response that arrives after a newer attempt or unmount.
      if (isCurrent) {
        apply(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  const retry = () => {
    setIsLoading(true);
    setAttempt((current) => current + 1);
  };

  return <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} isLoading={isLoading} error={error} onRetry={retry} />;
}
