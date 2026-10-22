import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Field, Input, SignInPanel, TextLink } from "../../../src";

function EmailForm() {
  return (
    <form className="flex flex-col gap-paragraph" aria-label="Sign in with email">
      <Field label="Email">{(control) => <Input {...control} type="email" autoComplete="email" />}</Field>
      <Field label="Password" hint="12 to 128 characters">
        {(control) => <Input {...control} type="password" autoComplete="current-password" />}
      </Field>
    </form>
  );
}

const meta = {
  title: "Product/E01 Mentor onboarding/Sign-in panel",
  component: SignInPanel,
  args: {
    githubHref: "#github",
    emailForm: <EmailForm />,
    registerLink: <TextLink href="#register">Create an account</TextLink>,
  },
} satisfies Meta<typeof SignInPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const links = canvas.getAllByRole("link");
    await expect(links[0]).toHaveTextContent("Continue with GitHub");
  },
};

export const GitHubCancelled: Story = { args: { error: "github_cancelled" } };
export const GitHubUnavailable: Story = { args: { error: "github_unavailable" } };
export const TooManyAttempts: Story = { args: { retryAfterSeconds: 300 } };
export const NarrowScreen: Story = {
  args: { error: "github_account_conflict" },
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
};
