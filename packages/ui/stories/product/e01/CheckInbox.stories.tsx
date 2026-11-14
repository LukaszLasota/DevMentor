import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { CheckInboxNotice } from "../../../src";

const meta = {
  title: "Product/E01 Mentor onboarding/Check inbox",
  component: CheckInboxNotice,
  args: {
    title: "Check your inbox to finish registration",
    children: <p>We sent an email to ola@devmentor.test. Open the link in it to set your password.</p>,
    onResend: fn(async (): Promise<string | null> => null),
    onUseDifferentEmail: fn(),
  },
  decorators: [(Story) => <div className="max-w-dialog">{Story()}</div>],
} satisfies Meta<typeof CheckInboxNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default (s03)",
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Check your inbox to finish registration");
  },
};

export const LinkSentAgain: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Send a new link" }));
    await expect(await canvas.findByText("We sent a new link.")).toBeVisible();
    await expect(args.onResend).toHaveBeenCalled();
  },
};

export const MailFailed: Story = {
  name: "Mail failed (L06)",
  args: { onResend: fn(async (): Promise<string | null> => "We could not send the email. Try again later, or continue with GitHub.") },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Send a new link" }));
    await expect(await canvas.findByText(/We could not send the email/)).toBeVisible();
  },
};

export const UseDifferentEmail: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Use a different email" }));
    await expect(args.onUseDifferentEmail).toHaveBeenCalled();
  },
};

export const Dark: Story = { globals: { theme: "dark" } };

export const NarrowScreen: Story = {
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};
