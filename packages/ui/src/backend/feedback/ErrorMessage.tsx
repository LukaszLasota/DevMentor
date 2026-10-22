import { cn } from "cn";
import { Button } from "../../components/ui/button";

export interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorMessage({ title = "Something went wrong", message, onRetry, className }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-start gap-2 rounded-md border border-destructive/40 p-4 text-sm", className)}
    >
      <p className="font-medium text-destructive">{title}</p>
      <p className="text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
