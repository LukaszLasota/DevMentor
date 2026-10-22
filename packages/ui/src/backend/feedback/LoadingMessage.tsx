import { cn } from "cn";
import { LoaderCircle } from "lucide-react";

export interface LoadingMessageProps {
  label?: string;
  className?: string;
}

/** Loading state of a region: a status message (and a spinner that only turns when motion is allowed). */
export function LoadingMessage({ label = "Loading…", className }: LoadingMessageProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-related py-paragraph text-body-small text-muted-foreground", className)}
    >
      <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      {label}
    </p>
  );
}
