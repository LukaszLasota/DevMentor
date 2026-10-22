import { cn } from "cn";
import { CircleX } from "lucide-react";
import { Button } from "../../components/ui/button";

export interface ErrorMessageProps {
  /** What failed, when the message alone does not say it ("Could not load mentors"). */
  title?: string;
  /** What happened, from the API error ("Database is unreachable."). */
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Error state of a region that failed to load. Says what happened and offers the next step
 * (Try again); never a bare "Something went wrong" (lesson 06 audit, decision 4).
 */
export function ErrorMessage({ title, message, onRetry, className }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn(
        "grid grid-cols-[var(--dm-button-icon)_1fr] items-start gap-x-related gap-y-related rounded-card border border-destructive p-paragraph text-body-small",
        className,
      )}
    >
      <CircleX aria-hidden="true" className="size-button-icon text-destructive" />
      <div className="flex flex-col gap-related">
        {title ? <p className="font-medium text-destructive">{title}</p> : null}
        <p className={title ? "text-foreground" : "font-medium text-destructive"}>{message}</p>
        {onRetry ? (
          <Button size="sm" className="self-start" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
