"use client"

import * as React from "react"
import { cn } from "cn"
import { Avatar as AvatarPrimitive } from "radix-ui"

// shadcn base, restyled for DevMentor (stage 2): a circle (convention, Jakob's law); the fallback is
// the initial on --muted with --foreground, never a colour per person (A01, approved Q4).
function Avatar({
  className,
  size = "md",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "lg" | "md" | "sm"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-avatar-md shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-avatar-lg data-[size=sm]:size-avatar-sm",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full border border-border bg-muted text-label font-medium text-foreground group-data-[size=lg]/avatar:text-heading-4 group-data-[size=sm]/avatar:text-caption",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
