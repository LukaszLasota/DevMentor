import { cn } from "cn";

export interface LoadingMessageProps {
  label?: string;
  className?: string;
}

export function LoadingMessage({ label = "Loading…", className }: LoadingMessageProps) {
  return (
    <p role="status" aria-live="polite" className={cn("py-6 text-center text-sm text-muted-foreground", className)}>
      {label}
    </p>
  );
}
