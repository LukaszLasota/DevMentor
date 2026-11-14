import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent } from "storybook/test";
import { SignOutButton } from "../../../src";
import { InvitationPanel } from "../../../src/mentors";

const meta = {
  title: "Product/E01 Mentor onboarding/Invitation panel",
  component: InvitationPanel,
  args: {
    state: {
      kind: "signed-out",
      email: "marta@example.com",
      tags: ["typescript", "ai-agents"],
      githubHref: "#github",
      emailHref: "#email",
    },
  },
} satisfies Meta<typeof InvitationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const match = { kind: "match", email: "marta@example.com", tags: ["typescript"], accountEmail: "marta@example.com" } as const;

export const SignedOut: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("link").map((a) => a.textContent)).toEqual(["Sign in with GitHub", "Sign in with email"]);
  },
};

export const InvitedAccount: Story = { args: { state: match } };

export const Accepting: Story = {
  args: { state: match, accepting: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Accepting…" })).toBeDisabled();
  },
};

/** L07 / DS-05: a failed accept keeps the panel; the error and "Try again" sit under the button. */
export const AcceptFailed: Story = {
  args: { state: match, acceptError: "Network error. Check your connection and try again." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Nothing changed.");
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible();
  },
};

/** The whole accept cycle with a failing first attempt: busy, error, retry. */
export const AcceptCycle: Story = {
  args: { state: match },
  render: function AcceptCycleStory(args) {
    const [attempt, setAttempt] = useState(0);
    const [accepting, setAccepting] = useState(false);

    const onAccept = () => {
      setAccepting(true);
      window.setTimeout(() => {
        setAccepting(false);
        setAttempt((n) => n + 1);
      }, 300);
    };

    return (
      <InvitationPanel
        {...args}
        onAccept={onAccept}
        accepting={accepting}
        acceptError={attempt === 1 ? "Network error. Check your connection and try again." : null}
      />
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }));
    await expect(await canvas.findByRole("alert", {}, { timeout: 2000 })).toBeVisible();
  },
};

export const OtherAccount: Story = {
  args: {
    state: { kind: "mismatch", email: "marta@example.com", accountEmail: "m.kowal@company.example" },
    signOut: <SignOutButton onSignedOut={() => undefined} />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  },
};

export const AlreadyMentor: Story = {
  args: { state: { kind: "already-mentor", mentorHref: "#mentor" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Go to your mentor page" })).toBeVisible();
  },
};

export const NotValid: Story = { args: { state: { kind: "invalid" } } };

export const NarrowScreen: Story = { decorators: [(Story) => <div className="w-phone">{Story()}</div>] };
