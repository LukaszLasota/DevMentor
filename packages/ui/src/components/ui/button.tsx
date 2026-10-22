import * as React from "react"
import { cn } from "cn"
import { LoaderCircle } from "lucide-react"
import { Slot } from "radix-ui"

import { buttonVariants, type ButtonVariantProps } from "./button-variants"

// Classes live in button-variants.ts (no Radix) so Tailwind-only public pages can style links
// and plain buttons the same way.
type ButtonProps = React.ComponentProps<"button"> &
  ButtonVariantProps & {
    asChild?: boolean
    /** Shows a spinner, blocks clicks and announces `loadingLabel` (trainer: loading state). */
    loading?: boolean
    /** Announced to screen readers while `loading` (e.g. "Saving…"). */
    loadingLabel?: string
  }

function Button({
  className,
  intent = "neutral",
  appearance = "outline",
  size = "md",
  iconOnly = false,
  asChild = false,
  loading = false,
  loadingLabel = "Loading…",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  const content = asChild ? (
    children
  ) : (
    <>
      {loading ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : null}
      {children}
      {loading ? (
        <span role="status" className="sr-only">
          {loadingLabel}
        </span>
      ) : null}
    </>
  )

  return (
    <Comp
      data-slot="button"
      data-intent={intent}
      data-appearance={appearance}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      className={cn(buttonVariants({ intent, appearance, size, iconOnly, className }))}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants, type ButtonProps }
