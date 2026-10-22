"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

// shadcn base, restyled for DevMentor (stage 2): 16 px box, 4 px radius (stage 2 Q3), no shadow.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-checkbox shrink-0 rounded-checkbox border border-input bg-background transition-colors duration-control outline-none",
        "focus-visible:focus-ring",
        "aria-invalid:border-destructive",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-checkbox p-px" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
