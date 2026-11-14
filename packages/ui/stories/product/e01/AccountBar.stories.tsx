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
    user: { email: "ola@devmentor.test" },
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

export const WithAvatarAndArea: Story = {
  name: "With avatar and area",
  args: {
    user: { email: "adam@devmentor.test", avatarUrl: avatar },
    area: "Admin",
  },
  play: async ({ canvas }) => {
    // Role links live in the shell sidebar since 2026-11-14 (see App shell).
    await expect(canvas.queryByRole("navigation")).toBeNull();
  },
};

export const Dark: Story = {
  args: WithAvatarAndArea.args,
  globals: { theme: "dark" },
};

export const NarrowScreen: Story = {
  args: {
    user: { email: "a.very.long.address@devmentor.test", avatarUrl: avatar },
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
