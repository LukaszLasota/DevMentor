import * as React from "react"
import { cn } from "cn"

// shadcn base, restyled for DevMentor (stage 2): same outline, focus and disabled rules as Input.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full min-w-0 max-w-full rounded-control border border-input bg-background px-field-pad py-related text-body text-foreground md:text-body-small",
        "transition-colors duration-control outline-none placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:focus-ring",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
