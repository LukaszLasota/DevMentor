import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { LoaderCircle } from "lucide-react"
import { Slot } from "radix-ui"

// shadcn base, restyled for DevMentor (stage 2). Two independent props, as in the trainer's system:
// `intent` says what the action does, `appearance` how loud it is. Four sizes, 40 → 28 px.
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-related whitespace-nowrap rounded-button border border-transparent",
    "text-label font-medium transition-colors duration-control outline-none",
    "focus-visible:focus-ring",
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground",
    "aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-disabled aria-disabled:text-disabled-foreground",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-button-icon",
  ],
  {
    variants: {
      intent: {
        primary: "",
        neutral: "",
        destructive: "",
      },
      appearance: {
        filled: "",
        outline: "bg-transparent",
        soft: "",
        text: "bg-transparent underline-offset-4 hover:underline",
      },
      size: {
        lg: "h-button-lg px-button-pad-lg",
        md: "h-button-md px-button-pad-md",
        sm: "h-button-sm px-button-pad-sm",
        xs: "h-button-xs px-button-pad-xs text-caption",
      },
      iconOnly: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      // primary and destructive text on --border would drop below 4.5:1, so their hover/pressed
      // states change the fill to --muted or add an outline instead.
      // primary
      { intent: "primary", appearance: "filled", class: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed" },
      { intent: "primary", appearance: "outline", class: "border-primary text-link hover:bg-muted active:bg-muted" },
      { intent: "primary", appearance: "soft", class: "bg-muted text-link hover:border-primary active:border-primary" },
      { intent: "primary", appearance: "text", class: "text-link" },
      // neutral
      { intent: "neutral", appearance: "filled", class: "bg-foreground text-background hover:bg-muted-foreground active:bg-muted-foreground" },
      { intent: "neutral", appearance: "outline", class: "border-input text-foreground hover:bg-muted active:bg-border" },
      { intent: "neutral", appearance: "soft", class: "bg-muted text-foreground hover:bg-border active:bg-border" },
      { intent: "neutral", appearance: "text", class: "text-foreground" },
      // destructive
      { intent: "destructive", appearance: "filled", class: "bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-hover" },
      { intent: "destructive", appearance: "outline", class: "border-destructive text-destructive hover:bg-muted active:bg-muted" },
      { intent: "destructive", appearance: "soft", class: "bg-muted text-destructive hover:border-destructive active:border-destructive" },
      { intent: "destructive", appearance: "text", class: "text-destructive" },
      // icon-only buttons are square
      { iconOnly: true, size: "lg", class: "w-button-lg" },
      { iconOnly: true, size: "md", class: "w-button-md" },
      { iconOnly: true, size: "sm", class: "w-button-sm" },
      { iconOnly: true, size: "xs", class: "w-button-xs" },
    ],
    defaultVariants: {
      intent: "neutral",
      appearance: "outline",
      size: "md",
      iconOnly: false,
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
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
