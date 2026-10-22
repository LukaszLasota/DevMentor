import { cn } from "cn";
import { Circle, CircleCheck } from "lucide-react";

export interface ReadinessItem {
  key: string;
  label: string;
  met: boolean;
  /** Extra line, e.g. the out-of-bounds price message (spec #24). */
  detail?: string;
  /** Where to fix it, e.g. "/mentor/prices". */
  href?: string;
  actionLabel?: string;
}

export interface ReadinessChecklistProps {
  title: string;
  items: ReadinessItem[];
  className?: string;
}

/**
 * What still blocks publishing or booking (specs #22–#25: readiness keys). Each item says "Done" or
 * "To do" in words and with an icon, never colour alone (spec #23, WCAG 1.4.1).
 */
export function ReadinessChecklist({ title, items, className }: ReadinessChecklistProps) {
  const done = items.filter((item) => item.met).length;

  return (
    <section aria-labelledby="readiness-title" className={cn("flex flex-col gap-related", className)}>
      <h2 id="readiness-title" className="text-heading-4 font-semibold">
        {title}
      </h2>
      <p className="text-caption text-muted-foreground">
        {done} of {items.length} done
      </p>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-related border-b border-border py-(--dm-list-row-padding-y)">
            {item.met ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-related">
              <p className="text-body-small">
                <span className="sr-only">{item.met ? "Done: " : "To do: "}</span>
                <span className={item.met ? "text-muted-foreground" : "font-medium text-foreground"}>{item.label}</span>
              </p>
              {item.detail ? <p className="text-caption text-warning">{item.detail}</p> : null}
            </div>
            {!item.met && item.href ? (
              <a
                href={item.href}
                className="shrink-0 rounded-control text-label text-link underline underline-offset-4 outline-none focus-visible:focus-ring"
              >
                {item.actionLabel ?? "Fix"}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
