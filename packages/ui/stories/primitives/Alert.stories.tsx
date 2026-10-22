import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert, CircleCheck, Info, CircleX } from "lucide-react";
import { expect } from "storybook/test";
import { Alert, AlertDescription, AlertTitle, Button } from "../../src";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  render: () => (
    <Alert className="max-w-measure">
      <Info aria-hidden="true" />
      <AlertTitle>Check your inbox</AlertTitle>
      <AlertDescription>We sent a link to set your password.</AlertDescription>
    </Alert>
  ),
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Check your inbox");
  },
};

export const Tones: Story = {
  render: () => (
    <div className="flex max-w-measure flex-col gap-paragraph">
      <Alert tone="success">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>Page published</AlertTitle>
        <AlertDescription>Mentees can open your share link now.</AlertDescription>
      </Alert>
      <Alert tone="warning">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Not bookable yet</AlertTitle>
        <AlertDescription>Publish at least one open time so mentees can book you.</AlertDescription>
      </Alert>
      <Alert tone="danger">
        <CircleX aria-hidden="true" />
        <AlertTitle>Invitation expired</AlertTitle>
        <AlertDescription>
          <p>Ask the operator for a new invitation link.</p>
          <Button size="sm">Back to sign in</Button>
        </AlertDescription>
      </Alert>
    </div>
  ),
};

export const LongTextNarrowScreen: Story = {
  render: () => (
    <Alert tone="warning" className="w-phone">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Payouts are held until your Stripe account is enabled</AlertTitle>
      <AlertDescription>The operator can see held payouts. Finish the Stripe onboarding to receive them.</AlertDescription>
    </Alert>
  ),
};
