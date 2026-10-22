import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../src";

const meta = {
  title: "Primitives/Card",
  component: Card,
  render: () => (
    <Card className="max-w-measure">
      <CardHeader>
        <CardTitle>Publish your page</CardTitle>
        <CardDescription>Add a display name, a public work link, a bio and at least one stack tag.</CardDescription>
        <CardAction>
          <Badge>Draft</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>Your share link appears here after the first publish.</CardContent>
      <CardFooter>
        <Button>Cancel</Button>
        <Button intent="primary" appearance="filled">
          Publish
        </Button>
      </CardFooter>
    </Card>
  ),
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Publish your page")).toBeVisible();
    await expect(canvas.getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Publish"]);
  },
};

export const ContentOnly: Story = {
  render: () => (
    <Card className="max-w-measure">
      <CardContent>Mentors who most recently published open times come first.</CardContent>
    </Card>
  ),
};

export const LongContentNarrowScreen: Story = {
  render: () => (
    <Card className="w-72">
      <CardHeader>
        <CardTitle>Connect Stripe to receive payouts for your sessions</CardTitle>
        <CardDescription>
          DevMentor keeps 20% of each paid session; the rest is paid out to your Stripe account once it is enabled.
        </CardDescription>
      </CardHeader>
    </Card>
  ),
};
