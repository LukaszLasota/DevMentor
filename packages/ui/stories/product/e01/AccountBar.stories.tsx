import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, fn, userEvent } from "storybook/test";
import { AccountBar, SignOutButton } from "../../../src";

const endpoint = "/api/auth/sign-out";
const avatar =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%23888'/></svg>";

const meta = {
  title: "Product/E01 Mentor onboarding/Account bar",
  component: AccountBar,
  parameters: { layout: "fullscreen" },
  args: {
    user: { email: "ola@devmentor.test", roles: ["mentee"] },
    signOut: <SignOutButton onSignedOut={fn()} />,
  },
} satisfies Meta<typeof AccountBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mentee: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("ola@devmentor.test")).toBeVisible();
    await expect(canvas.queryByRole("link")).toBeNull();
  },
};

export const MentorAndOperator: Story = {
  name: "Mentor and operator (L09)",
  args: {
    user: { email: "adam@devmentor.test", roles: ["mentee", "mentor", "operator"], avatarUrl: avatar },
    area: "Admin",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("link").map((link) => link.textContent)).toEqual(["Mentor", "Admin"]);
  },
};

export const Dark: Story = {
  args: MentorAndOperator.args,
  globals: { theme: "dark" },
};

export const NarrowScreen: Story = {
  args: {
    user: { email: "a.very.long.address@devmentor.test", roles: ["mentee", "mentor", "operator"], avatarUrl: avatar },
    area: "Admin",
  },
  decorators: [(Story) => <div className="w-phone">{Story()}</div>],
};

export const SigningOut: Story = {
  beforeEach({ msw }) {
    msw.use(
      http.post(endpoint, async () => {
        await delay("infinite");
        return HttpResponse.json({ ok: true, data: null });
      }),
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await expect(await canvas.findByRole("button", { name: /Signing out…/ })).toBeDisabled();
  },
};

export const SignOutFailed: Story = {
  beforeEach({ msw }) {
    msw.use(
      http.post(endpoint, () =>
        HttpResponse.json(
          { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "The service is unavailable. Try again later." } },
          { status: 503 },
        ),
      ),
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Sign-out did not finish");
    await expect(canvas.getByRole("button", { name: "Sign out" })).toBeEnabled();
  },
};
