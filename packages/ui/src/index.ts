// Public entry of @devmentor/ui — reusable React components.

// shadcn/ui primitives (added via `npx shadcn@latest add`, never hand-written)
export { Button, buttonVariants } from "./components/ui/button";
export { Checkbox } from "./components/ui/checkbox";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./components/ui/table";
export { Textarea } from "./components/ui/textarea";
export { cn } from "./lib/utils";

// Panel building blocks
export { apiCall, apiCallOrThrow, ApiError, readJsonSafe, type ApiCallInit, type ApiPath } from "./backend/api/apiCall";
export type { ApiFailure, ApiResult, ApiSuccess, FieldErrors } from "./backend/api/types";
export { CrudForm, type CrudFormField, type CrudFormFieldType, type CrudFormProps } from "./backend/forms/CrudForm";
export { DataTable, type DataTableColumn, type DataTableProps } from "./backend/tables/DataTable";
export { EmptyState, type EmptyStateProps } from "./backend/feedback/EmptyState";
export { ErrorMessage, type ErrorMessageProps } from "./backend/feedback/ErrorMessage";
export { LoadingMessage, type LoadingMessageProps } from "./backend/feedback/LoadingMessage";
