import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import { ProfileFormPattern } from "./ProfileFormPattern";

const endpoint = "/api/mentor-profile";

const meta = {
  title: "Patterns/Form",
  component: ProfileFormPattern,
} satisfies Meta<typeof ProfileFormPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  beforeEach({ msw }) {
    msw.use(http.put(endpoint, () => HttpResponse.json({ ok: true, data: { id: "p1" } })));
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    await expect(await canvas.findByText("Profile saved.")).toBeVisible();
  },
};

export const Pending: Story = {
  beforeEach({ msw }) {
    msw.use(
      http.put(endpoint, async () => {
        await delay("infinite");
        return HttpResponse.json({ ok: true, data: null });
      }),
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    const button = await canvas.findByRole("button", { name: /Saving…/ });
    await expect(button).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Cancel" })).toBeDisabled();
  },
};

export const ClientValidation: Story = {
  play: async ({ canvas }) => {
    const name = canvas.getByLabelText(/Display name/);
    await userEvent.clear(name);
    await userEvent.tab();
    await expect(canvas.getByText("Enter a display name of 1 to 80 characters.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(name).toHaveFocus());
  },
};

export const ServerFieldError: Story = {
  beforeEach({ msw }) {
    msw.use(
      http.put(endpoint, () =>
        HttpResponse.json(
          {
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Check the highlighted fields.",
              fieldErrors: { publicWorkUrl: ["Links with a user name or password are not allowed."] },
            },
          },
          { status: 400 },
        ),
      ),
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    await expect(await canvas.findByText("Links with a user name or password are not allowed.")).toBeVisible();
    await waitFor(() => expect(canvas.getByLabelText(/Link to your public work/)).toHaveFocus());
    await expect(canvas.getByLabelText(/Display name/)).toHaveValue("Marta Kowal");
  },
};

export const ServerError: Story = {
  beforeEach({ msw }) {
    msw.use(
      http.put(endpoint, () =>
        HttpResponse.json(
          { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Saving is not possible right now. Try again in a minute." } },
          { status: 503 },
        ),
      ),
    );
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Saving is not possible right now");
  },
};

export const Offline: Story = {
  beforeEach({ msw }) {
    msw.use(http.put(endpoint, () => HttpResponse.error()));
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save profile" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Network error. Check your connection and try again.");
  },
};
