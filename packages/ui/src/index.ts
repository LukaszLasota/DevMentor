// Public entry of @devmentor/ui — reusable React components.

// shadcn/ui primitives (added via `npx shadcn@latest add`, never hand-written)
export { Alert, AlertDescription, AlertTitle, alertVariants } from "./components/ui/alert";
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog";
export { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
export { Badge, badgeVariants } from "./components/ui/badge";
export { Button, buttonVariants, type ButtonProps } from "./components/ui/button";
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
export { Checkbox } from "./components/ui/checkbox";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export { Skeleton } from "./components/ui/skeleton";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./components/ui/table";
export { Textarea } from "./components/ui/textarea";
export { cn } from "./lib/utils";

// Panel building blocks
export { apiCall, apiCallOrThrow, ApiError, readJsonSafe, type ApiCallInit, type ApiPath } from "./backend/api/apiCall";
export type { ApiFailure, ApiResult, ApiSuccess, FieldErrors } from "./backend/api/types";
export { Field, type FieldControlProps, type FieldProps } from "./backend/forms/Field";
export { TextLink, type TextLinkProps } from "./backend/navigation/TextLink";
export { CrudForm, type CrudFormField, type CrudFormFieldType, type CrudFormProps } from "./backend/forms/CrudForm";
export { DataTable, type DataTableColumn, type DataTableProps } from "./backend/tables/DataTable";
export { EmptyState, type EmptyStateProps } from "./backend/feedback/EmptyState";
export { ErrorMessage, type ErrorMessageProps } from "./backend/feedback/ErrorMessage";
export { LoadingMessage, type LoadingMessageProps } from "./backend/feedback/LoadingMessage";
