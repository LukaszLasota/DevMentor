"use client"

import * as React from "react"
import { cn } from "cn"
import { Label as LabelPrimitive } from "radix-ui"

// shadcn base, restyled for DevMentor (stage 2): Label text style, disabled colour instead of opacity.
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-related text-label font-medium text-foreground select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-disabled-foreground peer-disabled:cursor-not-allowed peer-disabled:text-disabled-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Label }
