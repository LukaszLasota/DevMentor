import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// shadcn base, restyled for DevMentor (stage 2): thin outline, card radius, no shadow (R03.2).
// The tone colours the outline, icon and title; the description stays in readable text colour.
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-card border bg-card px-paragraph py-related text-body-small text-card-foreground has-[>svg]:grid-cols-[var(--dm-button-icon)_1fr] has-[>svg]:gap-x-related [&>svg]:size-button-icon [&>svg]:text-current",
  {
    variants: {
      tone: {
        neutral: "border-border",
        success: "border-success [&>svg]:text-success *:data-[slot=alert-title]:text-success",
        warning: "border-warning [&>svg]:text-warning *:data-[slot=alert-title]:text-warning",
        danger: "border-destructive [&>svg]:text-destructive *:data-[slot=alert-title]:text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

function Alert({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-tone={tone ?? "neutral"}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 font-medium", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-related text-foreground [&_p]:max-w-measure",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
