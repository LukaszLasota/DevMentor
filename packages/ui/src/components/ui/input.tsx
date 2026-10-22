import * as React from "react"
import { cn } from "cn"

// shadcn base, restyled for DevMentor (stage 2): 36 px like the default button, thin --input outline,
// no shadow (R03.2), clear focus outline, own disabled colours instead of opacity.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-field w-full min-w-0 rounded-control border border-input bg-background px-field-pad text-body text-foreground md:text-body-small",
        "transition-colors duration-control outline-none placeholder:text-muted-foreground",
        "selection:bg-primary selection:text-primary-foreground",
        "file:inline-flex file:h-full file:border-0 file:bg-transparent file:text-label file:font-medium file:text-foreground",
        "focus-visible:border-ring focus-visible:focus-ring",
        "aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
