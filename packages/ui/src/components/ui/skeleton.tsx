import { cn } from "cn"

// shadcn base, restyled for DevMentor (stage 2): pulses only when motion is allowed (WCAG 2.3.3)
// and is hidden from screen readers; the surrounding region announces "Loading…".
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-control bg-muted motion-safe:animate-pulse", className)}
      {...props}
    />
  )
}

export { Skeleton }
