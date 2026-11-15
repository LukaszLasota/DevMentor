import { useId } from "react";
import { cn } from "cn";

export interface SideNavItem {
  href: string;
  label: string;
}

export interface SideNavSection {
  /** Section name shown above its links ("Admin"); the first section usually has none. */
  label?: string;
  items: readonly SideNavItem[];
}

export interface SideNavProps {
  /** Accessible name of the navigation landmark. */
  label: string;
  sections: readonly SideNavSection[];
  /** Pathname of the open page; the item with the longest matching path is the current one. */
  currentPath: string;
}

function matches(href: string, path: string) {
  return path === href || path.startsWith(`${href}/`);
}

/** The href of the current item: the longest one that is the path or a parent of it. */
export function currentHref(sections: readonly SideNavSection[], path: string): string | undefined {
  return sections
    .flatMap((section) => section.items.map((item) => item.href))
    .filter((href) => matches(href, path))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Sidebar of the signed-in app shell: grouped links, the current one marked with
 * `aria-current="page"`. Inside `AppShell` (its container query): a column next to the page from
 * 48rem up, a wrapping row under the header below it (no menu button needed for a handful of links). Plain links: role areas live in
 * different root layouts, so a full page load is the right navigation.
 */
export function SideNav({ label, sections, currentPath }: SideNavProps) {
  const current = currentHref(sections, currentPath);
  const idPrefix = useId();

  return (
    <nav
      aria-label={label}
      className="border-b border-border px-paragraph py-related @3xl:w-sidebar @3xl:shrink-0 @3xl:border-r @3xl:border-b-0 @3xl:py-panel"
    >
      <div className="flex flex-wrap items-center gap-x-paragraph gap-y-related @3xl:flex-col @3xl:items-stretch @3xl:gap-panel">
        {sections.map((section, index) => {
          const headingId = section.label ? `${idPrefix}-section-${index}` : undefined;

          return (
            <div key={index} className="flex flex-wrap items-center gap-related @3xl:flex-col @3xl:items-stretch">
              {section.label ? (
                <span id={headingId} className="px-related text-caption font-medium text-muted-foreground">
                  {section.label}
                </span>
              ) : null}
              <ul aria-labelledby={headingId} className="flex flex-wrap items-center gap-related @3xl:flex-col @3xl:items-stretch">
                {section.items.map(({ href, label: itemLabel }) => {
                  const isCurrent = href === current;

                  return (
                    <li key={href}>
                      <a
                        href={href}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "block rounded-control px-related py-related text-label transition-colors duration-control outline-none focus-visible:focus-ring",
                          isCurrent
                            ? "bg-muted font-semibold text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {itemLabel}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
