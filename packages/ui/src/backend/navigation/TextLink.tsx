import type { ComponentProps } from "react";
import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import { Slot } from "radix-ui";

export interface TextLinkProps extends ComponentProps<"a"> {
  /** Opens in a new tab with rel="noopener noreferrer" and says so to screen readers. */
  external?: boolean;
  /** Render a router link (e.g. next/link) as the child instead of a plain <a>. */
  asChild?: boolean;
}

/**
 * Link in running text. Always underlined: the action colour alone is not enough to tell
 * a link from text (WCAG 1.4.1). Navigates; never performs an action (use Button for that).
 */
export function TextLink({ external = false, asChild = false, className, children, ...props }: TextLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  const externalProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <Comp
      data-slot="text-link"
      className={cn(
        "rounded-control text-link underline underline-offset-4 transition-colors duration-control outline-none hover:decoration-2 focus-visible:focus-ring",
        external && "inline-flex items-center gap-related",
        className,
      )}
      {...externalProps}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {external ? (
            <>
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </>
          ) : null}
        </>
      )}
    </Comp>
  );
}
