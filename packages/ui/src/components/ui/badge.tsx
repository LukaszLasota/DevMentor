import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react"
import { Slot } from "radix-ui"

// shadcn base, reworked into a status badge for DevMentor (stage 2): rectangle with the control
// radius, never a pill (A01); the tone colours only the icon and text, and every status has an icon
// and a word, so colour is never the only signal (WCAG 1.4.1).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-related rounded-control bg-muted px-related py-badge-y text-caption font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "text-foreground",
        success: "text-success",
        warning: "text-warning",
        danger: "text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

const toneIcon = {
  neutral: CircleDashed,
  success: CircleCheck,
  warning: CircleAlert,
  danger: CircleX,
} as const

function Badge({
  className,
  tone = "neutral",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  const Icon = toneIcon[tone ?? "neutral"]

  return (
    <Comp
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          <Icon aria-hidden="true" />
          {children}
        </>
      )}
    </Comp>
  )
}

export { Badge, badgeVariants }
