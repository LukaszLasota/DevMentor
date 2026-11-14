import type { ReactNode } from "react";

export interface AppShellProps {
  /** The account bar (or nothing, e.g. without a session). */
  header: ReactNode;
  /** The sidebar (`SideNav`), or nothing. */
  nav: ReactNode;
  children: ReactNode;
}

/**
 * Frame of every signed-in page: header on top, sidebar next to the page when the shell is at least
 * 48rem wide and above it on narrower screens. A container query (not the viewport), so stories and
 * embedded frames show the real narrow layout. `min-w-0` keeps wide content from pushing the page sideways.
 */
export function AppShell({ header, nav, children }: AppShellProps) {
  return (
    <div className="@container flex min-h-dvh flex-col">
      {header}
      <div className="flex flex-1 flex-col @3xl:flex-row">
        {nav}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
