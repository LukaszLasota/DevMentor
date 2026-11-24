import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { AccountBar, ACCOUNT_NAV_LABEL, accountNavSections, AppShell, EmptyState, SideNav, SignOutButton, type AccountRole } from "../../../src";

const avatar =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%23888'/></svg>";

interface ShellStoryProps {
  email: string;
  roles: AccountRole[];
  area?: string;
  /** Pathname of the open page (the app reads it with `usePathname`). */
  path: string;
  heading: string;
}

/** The signed-in shell as the `(mentee)`/`(admin)` layouts compose it (AccountHeader + AccountNav). */
function SignedInShell({ email, roles, area, path, heading }: ShellStoryProps) {
  return (
    <div className="bg-background text-foreground">
      <AppShell
        header={<AccountBar user={{ email, avatarUrl: avatar }} area={area} signOut={<SignOutButton onSignedOut={fn()} />} />}
        nav={<SideNav label={ACCOUNT_NAV_LABEL} sections={accountNavSections(roles)} currentPath={path} />}
      >
        <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
          <h1 className="text-heading-1 font-semibold">{heading}</h1>
          <EmptyState title="Page content" description="Each page renders here, next to the sidebar." />
        </main>
      </AppShell>
    </div>
  );
}

const meta = {
  title: "Product/E01 Mentor onboarding/App shell",
  component: SignedInShell,
  parameters: { layout: "fullscreen" },
  args: { email: "ola@devmentor.test", roles: ["mentee"], path: "/mentors", heading: "Mentors" },
} satisfies Meta<typeof SignedInShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const linkNames = (nav: HTMLElement) => Array.from(nav.querySelectorAll("a")).map((link) => link.textContent);

export const Mentee: Story = {
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Main" });
    await expect(linkNames(nav)).toEqual(["Mentors", "My sessions"]);
    await expect(canvas.getByRole("link", { name: "Mentors" })).toHaveAttribute("aria-current", "page");
  },
};

export const MentorAndOperator: Story = {
  name: "Mentor and operator on /admin (L09)",
  args: { email: "adam@devmentor.test", roles: ["mentee", "mentor", "operator"], area: "Admin", path: "/admin", heading: "Admin" },
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Main" });
    await expect(linkNames(nav)).toEqual(["Mentors", "My sessions", "Mentor workspace", "Your page", "Prices", "Open times", "Payouts", "Dashboard", "Invitations"]);
    await expect(canvas.getByRole("list", { name: "Admin" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  },
};

export const Dark: Story = {
  args: MentorAndOperator.args,
  globals: { theme: "dark" },
};

export const NarrowScreen: Story = {
  name: "Narrow screen (sidebar as a row)",
  args: { ...MentorAndOperator.args, email: "a.very.long.address@devmentor.test" },
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
  play: async ({ canvasElement, canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Main" });
    // Under 48rem the sidebar sits above the page, and nothing scrolls sideways.
    await expect(nav.compareDocumentPosition(canvas.getByRole("main")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(nav.getBoundingClientRect().width).toBeGreaterThan(canvas.getByRole("main").getBoundingClientRect().width - 1);
    const shell = canvasElement.querySelector(".w-phone") as HTMLElement;
    await expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth);
  },
};
