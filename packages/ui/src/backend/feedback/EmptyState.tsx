import type { ReactNode } from "react";
import { cn } from "cn";

export interface EmptyStateProps {
  /** Why it is empty, in the user's words ("No open times yet"). */
  title: string;
  /** The next step ("Publish your first slot so mentees can book you."). */
  description?: string;
  /** The action that fills it (Button). */
  action?: ReactNode;
  className?: string;
}

/** Empty state of a list or region: says why it is empty and what to do next. Left-aligned (A01). */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-related rounded-card border border-dashed border-border p-panel text-body-small",
        className,
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-measure text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}
