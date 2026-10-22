import { cn } from "cn";
import { STACK_TAGS, type StackTagKey } from "./vocabulary";

/**
 * The /mentors filter (spec #27): a nav of links, one value at a time, the active one marked with
 * aria-current and an underline (not colour alone). No search box, no sort control (R08).
 */
export function MentorTagFilter({
  active,
  basePath = "/mentors",
}: {
  active: StackTagKey | null;
  /** List the filter belongs to, e.g. "/favorites" (agent test 2026-10-22). */
  basePath?: string;
}) {
  const items = [{ key: null, label: "All" }, ...STACK_TAGS];

  return (
    <nav aria-label="Filter by stack tag">
      <ul className="flex flex-wrap gap-related">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.label}>
              <a
                href={item.key ? `${basePath}?tag=${item.key}` : basePath}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-button-sm items-center rounded-control px-related text-label outline-none transition-colors duration-control focus-visible:focus-ring",
                  isActive
                    ? "bg-muted font-medium text-foreground underline decoration-2 underline-offset-4"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
